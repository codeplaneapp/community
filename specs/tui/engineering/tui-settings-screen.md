# Engineering Specification: TUI Settings Screen

## Implementation Plan

### 1. Update Screen Router & Navigation
**File: `apps/tui/src/navigation/ScreenRegistry.ts` (or equivalent)**
- Register `Settings` in the `ScreenName` enum and `screenRegistry` mapping it to `SettingsScreen`.
- Ensure it requires authentication but does not require repo context (`requiresRepo: false`).

**File: `apps/tui/src/commands/commandRegistry.ts`**
- Add a `:settings` command to the command palette registry that triggers `push("Settings", { section: "home" })`.

**File: `apps/tui/src/App.tsx` (or CLI deep-link parser)**
- Add support for `--screen settings` deep link to push the Settings screen onto the initial stack.

### 2. Implement Settings Screen Container
**File: `apps/tui/src/screens/Settings/SettingsScreen.tsx`**
- Create the main container component for the Settings screen.
- **State Management:**
  - Track `activeSection` (Home, Profile, Emails, SSH Keys, Tokens, Notifications, Connected Accounts).
  - Track `focusedZone` (sidebar vs content) to handle `Tab`/`Shift+Tab` focus switching.
- **Layout & Responsiveness:**
  - Consume `useLayout()` to get `breakpoint`.
  - **Minimum (80x24):** Render horizontal tabs instead of a sidebar. Disable sidebar navigation keys (`j`/`k`) for the tab bar and rely on `Tab`/`Shift+Tab` or number keys.
  - **Standard (120x40):** Render a 25% width vertical sidebar and 75% width content area.
  - **Large (200x60+):** Render an expanded 30% width sidebar with section descriptions.
- **Keybindings (`useScreenKeybindings`):**
  - Register `j`/`k` / `Down`/`Up` for vertical sidebar navigation.
  - Register `Tab`/`Shift+Tab` for zone focus switching.
  - Register `1`-`7` number keys to jump directly to sections.
  - Register `q` to pop the screen.
  - Register `?` for the help overlay and populate it with Settings-specific key hints.
- **Content Rendering:**
  - Switch statement to render the appropriate sub-component based on `activeSection`.
  - Pass `onNavigate={(section) => setActiveSection(section)}` down to `SettingsHome`.

### 3. Implement Home Summary Dashboard
**File: `apps/tui/src/screens/Settings/SettingsHome.tsx`**
- Create the dashboard component for the "Home" section.
- **Data Fetching:**
  - Use `@codeplane/ui-core` hooks concurrently: `useUser()`, `useUserEmails()`, `useUserSSHKeys()`, `useUserTokens()`, `useNotificationPreferences()`, `useUserConnectedAccounts()`.
- **State Management:**
  - Track `focusedCardIndex` (0 to 5) for vertical keyboard navigation (`j`/`k`).
- **Keybindings:**
  - Register `j`/`k` to move `focusedCardIndex` up and down.
  - Register `Enter` to call `onNavigate` for the currently focused card.
  - Register `R` to trigger `refetch()` for any hooks in an error state.
- **Card Rendering Components:**
  - Create a generic `SummaryCard` component supporting three states: `loading` (skeleton), `error` (red text, "R to retry"), and `ready`.
  - **Profile Card:** Render display name (fallback to username) and bio (truncated at 60ch).
  - **Emails Card:** Render count and masked primary email (`a***e@example.com`).
  - **SSH Keys Card:** Render count and relative date of the most recently added key.
  - **Tokens Card:** Render count of active tokens.
  - **Notifications Card:** Render "enabled/disabled" state.
  - **Connected Accounts Card:** Render count and list of provider names.
- **Responsiveness:**
  - At minimum breakpoint, render cards in a single full-width column.
  - Truncate text appropriately to prevent layout breakage.

## Unit & Integration Tests

**File: `e2e/tui/settings.test.ts`**

We will implement the required 146 tests using `@microsoft/tui-test` organized into categories.

### 1. Terminal Snapshot Tests
- **Setup:** Launch TUI at 120x40, 80x24, and 200x60 breakpoints.
- **Assertions:** Navigate to the Settings screen and capture `.toMatchSnapshot()` of the Home section in loading, error, and ready states.
- Capture focused states for the sidebar and summary cards to verify reverse video and primary color highlights.
- Verify that empty states for list sections render correctly.

### 2. Keyboard Interaction Tests
- **Navigation:** Simulate `j`, `k`, `Down`, `Up` to ensure sidebar focus moves correctly.
- **Selection:** Simulate `Enter` on the sidebar and verify the content area updates.
- **Shortcuts:** Simulate `1`-`7` to verify immediate section jumping.
- **Focus Toggling:** Simulate `Tab` and `Shift+Tab` and verify focus styling moves between the sidebar and the content area.
- **Card Interaction:** Simulate `j`/`k` inside the Home section to focus cards, and `Enter` to navigate to the detailed section.
- Simulate `R` and verify it triggers a retry for failed data fetches.

### 3. Responsive Tests
- Verify sidebar collapses to horizontal tabs at `80x24`.
- Trigger terminal resize dynamically (`terminal.resize()`) from 120x40 to 80x24 and assert that focus state is preserved and layout updates synchronously.
- Verify truncation lengths on bio and emails match constraints at minimum and standard breakpoints.

### 4. Integration Tests
- **Deep Link:** Launch with `args: ["--screen", "settings"]` and assert the screen is immediately visible.
- **Command Palette:** Launch TUI, simulate `:`, type `settings`, press `Enter`, and assert navigation to Settings.
- **Data Fetching:** Provide mocked API responses for the endpoints and verify the dashboard cards aggregate the correct counts and statuses.
- **Error Handling:** Force an API error for one endpoint, verify the individual card shows an error state, while other cards render their valid data.

### 5. Edge Case Tests
- Test with missing optional fields (e.g., null bio).
- Test rapid key presses (`j` multiple times) to ensure the active index doesn't go out of bounds.
- Test with unicode characters in display names to ensure grapheme-aware truncation.