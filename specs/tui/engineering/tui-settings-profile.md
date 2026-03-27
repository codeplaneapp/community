# Engineering Specification: TUI Settings Profile Tab

## 1. Overview
This specification details the implementation of the Profile tab within the Settings screen for the Codeplane TUI. The Profile tab serves as a form for users to update their personal information (Display Name, Bio, Avatar URL, and Email) via keyboard-driven interactions. It includes responsive layout scaling, dirty-state tracking with a discard confirmation modal, inline validation, and optimistic UI updates upon submission.

## 2. Architecture & Patterns

### 2.1 Component Structure
- **`ProfileTab`**: The main container for the profile form. It manages the local state of the form fields, tracks the currently focused field, computes the dirty state by comparing local values to the cached API data, and orchestrates the submission via `@codeplane/ui-core`'s data hooks.
- **`DiscardDialog`**: A modal component rendered conditionally when the user attempts to exit the form with unsaved changes. It traps focus and handles the `y` (confirm) and `n`/`Esc` (cancel) keypresses.
- **Form System Integration**: Utilizes OpenTUI's `<input>` and `<input multiline>` primitives, combined with an internal focus index (0: Display Name, 1: Bio, 2: Avatar URL, 3: Email, 4: Save button, 5: Cancel button) to handle `Tab` and `Shift+Tab` cycling.

### 2.2 Data Layer
- **`useUser()`**: Fetches the `UserProfile` on mount. This hook handles caching and provides the baseline values for the form.
- **`useUpdateUser()`**: Executes the `PATCH /api/user` request. The payload will only contain fields that have been modified compared to the baseline.
- **Optimistic UI & Banners**: Upon submission, the form enters a "Saving..." state (disabling inputs). Success triggers a green confirmation banner that auto-dismisses after 3 seconds. Errors (validation or network) render a red error banner at the top of the form.

### 2.3 Keyboard & Input Handling
- `useKeyboard` from `@opentui/react` will capture input events at the `ProfileTab` level to handle `Tab`/`Shift+Tab` cycling, `Ctrl+S` submission, and `Esc` cancellation.
- Form inputs will be styled with `theme.primary` border color when focused, and `theme.border` when inactive.

### 2.4 Responsive Layout
The `useLayout()` hook will determine the visual structure based on breakpoints:
- **Minimum (80x24)**: Bio is 3 lines high, labels are abbreviated ("Name:", "Bio:", "Avatar:", "Email:"). Avatar note is hidden.
- **Standard (120x40)**: Bio is 6 lines high, labels are full. Avatar note is visible.
- **Large (200x60+)**: Bio is 10 lines high, layout expands horizontally.

## Implementation Plan

### Step 1: Create Validation and Utilities
**File**: `apps/tui/src/screens/settings/utils/profileValidation.ts`
- Implement robust validation functions matching server constraints.
- `validateAvatarUrl(url: string)`: Checks for HTTP/HTTPS formatting and length <= 2048.
- `validateDisplayName(name: string)`: Checks length <= 255.
- `validateBio(bio: string)`: Checks length <= 2000.
- `getModifiedFields(original, current)`: Utility to diff the form state and extract only changed fields for the `PATCH` payload.

### Step 2: Implement Discard Confirmation Dialog
**File**: `apps/tui/src/screens/settings/components/DiscardDialog.tsx`
- Create a reusable modal using OpenTUI's absolute positioning.
- Props: `isOpen`, `onConfirm`, `onCancel`.
- Render a `<box>` with `position="absolute"`, centered, applying `theme.warning` border.
- Capture `y` for confirm and `n` / `Esc` for cancel using `useKeyboard`.
- Ensure it blocks background interaction when `isOpen` is true.

### Step 3: Implement Profile Tab Component
**File**: `apps/tui/src/screens/settings/tabs/ProfileTab.tsx`
- **State Setup**: Initialize state for `displayName`, `bio`, `avatarUrl`, `email`, `focusedIndex` (default `0`), `banner` (for success/error messages), and `isSubmitting`.
- **Data Hooks**: Call `useUser()` to populate the initial state when the data arrives. Call `useUpdateUser()` for mutations.
- **Dirty Check**: Create an `isDirty` boolean derived from comparing local state to `user` data.
- **Keyboard Navigation**: Implement a custom `useKeyboard` listener:
  - `Tab`/`Shift+Tab`: Cycle `focusedIndex` between 0 and 5. Wrap at edges.
  - `Ctrl+S`: Trigger `handleSave()`.
  - `Esc`: If `isDirty` is true, open the `DiscardDialog`. If false, trigger navigation pop.
  - `Enter`: If `focusedIndex === 4` (Save), submit. If `5` (Cancel), trigger cancel flow.
- **Rendering**:
  - Consume `useLayout()` and `useTheme()`.
  - Render the read-only summary (Username, Member since, Admin badge).
  - Render the Error/Success banner conditionally.
  - Map the `<input>` fields: `DisplayName` (index 0), `Bio` (index 1, multiline), `AvatarUrl` (index 2), `Email` (index 3). Apply `theme.primary` border if focused, or `theme.error` if validation fails.
  - Dynamically calculate input properties based on breakpoint (e.g., label text, bio `height`).
  - Render action buttons (Save / Cancel).

### Step 4: Integrate Profile Tab into Settings Screen
**File**: `apps/tui/src/screens/settings/SettingsScreen.tsx`
- Import `ProfileTab`.
- Register the profile tab in the settings screen's tab map (Tab `1`).
- Ensure the settings screen renders the `ProfileTab` component when it is the active tab, passing down any necessary router contexts.

## Unit & Integration Tests

### Keyboard & Flow Tests
**File**: `e2e/tui/settings.test.ts`
- `TUI_SETTINGS_PROFILE — Tab cycles through all form fields in order`: Assert focus styles move from Display Name -> Bio -> Avatar -> Email -> Save -> Cancel.
- `TUI_SETTINGS_PROFILE — Shift+Tab cycles backward through fields`.
- `TUI_SETTINGS_PROFILE — display name field is focused by default on load`.
- `TUI_SETTINGS_PROFILE — Ctrl+S from display name field submits form`: Simulate `Ctrl+S` and intercept the API call, ensuring it payload matches edits.
- `TUI_SETTINGS_PROFILE — Ctrl+S with no changes shows no-changes message`: Verify muted "No changes to save" text appears.
- `TUI_SETTINGS_PROFILE — typing in bio field updates value and character count`: Send multi-line input and assert the `42/2000` text updates properly.
- `TUI_SETTINGS_PROFILE — Esc with changes shows discard dialog`: Input text, hit `Esc`, verify the modal mounts.
- `TUI_SETTINGS_PROFILE — y in discard dialog discards and navigates back`: Hit `y` in modal, assert navigation changes back to root/previous.
- `TUI_SETTINGS_PROFILE — n in discard dialog returns to form`: Hit `n`, assert modal unmounts and form state is preserved.

### Validation & Error Tests
**File**: `e2e/tui/settings.test.ts`
- `TUI_SETTINGS_PROFILE — 422 avatar_url validation shows specific error`: Provide bad URL (e.g., `ftp://invalid`), save, and verify red error banner and red field border.
- `TUI_SETTINGS_PROFILE — 500 on save shows server error with request ID`: Mock a 500 error, assert the error banner appears, press `R` to verify retry mechanism triggers.
- `TUI_SETTINGS_PROFILE — bio at 2000 character boundary`: Assert input allows exactly 2000 characters and updates text to red when breached.

### Responsive & Snapshot Tests
**File**: `e2e/tui/settings.test.ts`
- `TUI_SETTINGS_PROFILE — renders profile form at 120x40 with all fields pre-populated`: Snapshot test standard size.
- `TUI_SETTINGS_PROFILE — renders profile form at 80x24 minimum size with abbreviated labels`: Snapshot test for minimum boundaries.
- `TUI_SETTINGS_PROFILE — resize from 120x40 to 80x24 preserves form state and adjusts bio height`: Test terminal resize mid-edit, ensuring local text values survive the resize render loop.
- `TUI_SETTINGS_PROFILE — renders read-only username and member-since in summary`: Regex assertion on header metadata.