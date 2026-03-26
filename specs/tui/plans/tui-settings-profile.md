# Implementation Plan: TUI Settings Profile Tab

## 1. Overview
This plan details the implementation of the Profile tab within the Settings screen for the Codeplane TUI. The Profile tab provides a keyboard-driven form for users to update their personal information (Display Name, Bio, Avatar URL, and Email). It features responsive layout scaling, dirty-state tracking with a discard confirmation modal, inline validation, and optimistic UI updates upon submission.

## Step 1: Create Validation and Utilities
**File**: `apps/tui/src/screens/settings/utils/profileValidation.ts`
- Implement validation functions matching server constraints:
  - `validateAvatarUrl(url: string)`: Checks for HTTP/HTTPS formatting and length <= 2048.
  - `validateDisplayName(name: string)`: Checks length <= 255.
  - `validateBio(bio: string)`: Checks length <= 2000.
- Create a utility to diff the form state:
  - `getModifiedFields(original, current)`: Extracts only changed fields for the `PATCH` payload.

## Step 2: Implement Discard Confirmation Dialog
**File**: `apps/tui/src/screens/settings/components/DiscardDialog.tsx`
- Create a reusable modal using OpenTUI's absolute positioning (`<box position="absolute">`).
- Define Props: `isOpen`, `onConfirm`, `onCancel`.
- Apply `theme.warning` border and center the modal on the screen.
- Use `useKeyboard` to capture `y` for confirm and `n` or `Esc` for cancel.
- Ensure the modal blocks background interaction and traps focus when `isOpen` is true.

## Step 3: Implement Profile Tab Component
**File**: `apps/tui/src/screens/settings/tabs/ProfileTab.tsx`
- **State Setup**: Initialize state for `displayName`, `bio`, `avatarUrl`, `email`, `focusedIndex` (default `0`), `banner` (for success/error messages), and `isSubmitting`.
- **Data Hooks**: Call `useUser()` from `@codeplane/ui-core` to populate the initial state. Call `useUpdateUser()` for mutations.
- **Dirty Check**: Create an `isDirty` boolean derived from comparing local state to the initial `user` data.
- **Keyboard Navigation**: Implement a custom `useKeyboard` listener:
  - `Tab`/`Shift+Tab`: Cycle `focusedIndex` between 0 and 5. Wrap at edges.
  - `Ctrl+S`: Trigger `handleSave()`.
  - `Esc`: If `isDirty` is true, open the `DiscardDialog`. If false, trigger navigation pop.
  - `Enter`: If `focusedIndex === 4` (Save), submit. If `5` (Cancel), trigger cancel flow.
- **Rendering**:
  - Consume `useTerminalDimensions()` and OpenTUI theme.
  - Render the read-only summary (Username, Member since, Admin badge).
  - Render the Error/Success banner conditionally.
  - Map the `<input>` and `<textarea>` (or `<input multiline>`) fields: Display Name (0), Bio (1), Avatar URL (2), Email (3).
  - Apply `theme.primary` border if focused, or `theme.error` if validation fails.
  - Dynamically calculate input properties based on breakpoint (e.g., label text abbreviation, bio height: 3 lines for 80x24, 6 lines for 120x40, 10 lines for 200x60+).
  - Render action buttons (Save / Cancel).

## Step 4: Integrate Profile Tab into Settings Screen
**File**: `apps/tui/src/screens/settings/SettingsScreen.tsx`
- Import the `ProfileTab` component.
- Register the profile tab in the settings screen's tab map (e.g., Tab `1`).
- Ensure the settings screen renders the `ProfileTab` component when it is the active tab, passing down any necessary router or context props.

## Step 5: Unit & Integration Tests
**File**: `e2e/tui/settings.test.ts`
- **Keyboard & Flow Tests**:
  - `TUI_SETTINGS_PROFILE — Tab cycles through all form fields in order`.
  - `TUI_SETTINGS_PROFILE — Shift+Tab cycles backward through fields`.
  - `TUI_SETTINGS_PROFILE — display name field is focused by default on load`.
  - `TUI_SETTINGS_PROFILE — Ctrl+S from display name field submits form`.
  - `TUI_SETTINGS_PROFILE — Ctrl+S with no changes shows no-changes message`.
  - `TUI_SETTINGS_PROFILE — typing in bio field updates value and character count`.
  - `TUI_SETTINGS_PROFILE — Esc with changes shows discard dialog`.
  - `TUI_SETTINGS_PROFILE — y in discard dialog discards and navigates back`.
  - `TUI_SETTINGS_PROFILE — n in discard dialog returns to form`.
- **Validation & Error Tests**:
  - `TUI_SETTINGS_PROFILE — 422 avatar_url validation shows specific error`.
  - `TUI_SETTINGS_PROFILE — 500 on save shows server error with request ID`.
  - `TUI_SETTINGS_PROFILE — bio at 2000 character boundary`.
- **Responsive & Snapshot Tests**:
  - `TUI_SETTINGS_PROFILE — renders profile form at 120x40 with all fields pre-populated` (Snapshot).
  - `TUI_SETTINGS_PROFILE — renders profile form at 80x24 minimum size with abbreviated labels` (Snapshot).
  - `TUI_SETTINGS_PROFILE — resize from 120x40 to 80x24 preserves form state and adjusts bio height`.
  - `TUI_SETTINGS_PROFILE — renders read-only username and member-since in summary` (Regex assertion).