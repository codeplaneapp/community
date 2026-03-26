# Codeplane TUI: Settings Screen Implementation Plan

## Phase 1: Routing & Registration

**1. Update Screen Registry**
- **File:** `apps/tui/src/router/registry.ts`
- **Action:** Replace the `PlaceholderScreen` mapped to `ScreenName.Settings` with the new `SettingsScreen` component. Ensure `requiresRepo: false` is set for this route.

**2. Update Command Palette**
- **File:** `apps/tui/src/commands/commandRegistry.ts`
- **Action:** Add a command entry for `:settings`.
- **Implementation:**
  ```typescript
  {
    id: 'global.settings',
    title: 'Open Settings',
    shortcut: ['g', 's'],
    execute: ({ navigation }) => navigation.push('Settings', { section: 'home' })
  }
  ```

## Phase 2: Core Settings Container (`SettingsScreen`)

**File:** `apps/tui/src/screens/Settings/SettingsScreen.tsx`

**1. State & Layout Management**
- Use `useState` for `activeSection` (defaulting to `'home'` or the passed route param). Valid values: `home`, `profile`, `emails`, `ssh_keys`, `tokens`, `notifications`, `connected_accounts`.
- Use `useState` for `focusedZone` (either `'sidebar'` or `'content'`).
- Use `useBreakpoint()` from `apps/tui/src/hooks/useBreakpoint.ts` to determine layout width (`minimum`, `standard`, `large`).

**2. Keyboard Interaction (`useKeyboard`)**
- Register key handlers scoping logic by `focusedZone`:
  - **Global:** `q` -> `navigation.pop()`, `?` -> toggle help, `1`-`7` -> jump to specific `activeSection`. `Tab` / `Shift+Tab` -> toggle `focusedZone` between `'sidebar'` and `'content'`.
  - **Sidebar Zone:** `j` / `Down` -> next section, `k` / `Up` -> previous section.

**3. Render Tree**
- **Root `<box>`:** `flexDirection="row"`, `width="100%"`, `height="100%"`.
- **Responsive Handling:**
  - If `breakpoint === 'minimum'`: Render horizontal `<box flexDirection="row">` for tabs above the content instead of a sidebar. Disable `j/k` for tabs, relying strictly on `Tab`/`Shift+Tab` to switch zones and `h/l` for tab switching.
  - Otherwise: Render a vertical sidebar `<box flexDirection="column" width={breakpoint === 'large' ? '30%' : '25%'}>`.
- **Sidebar Rendering:** Map over section definitions. Apply `color="primary"` (or reverse video) to the active section. Apply a border or subtle highlight if `focusedZone === 'sidebar'`.
- **Content Area:** A `<box width="100%" flexDirection="column">` that acts as a switch statement, rendering `<SettingsHome>` when `activeSection === 'home'`. Pass down `focused={focusedZone === 'content'}` and `onNavigate={(section) => setActiveSection(section)}`.

## Phase 3: Home Summary Dashboard (`SettingsHome`)

**File:** `apps/tui/src/screens/Settings/SettingsHome.tsx`

**1. Data Fetching**
- Import standard data hooks from `@codeplane/ui-core`: `useUser`, `useUserEmails`, `useUserSSHKeys`, `useUserTokens`, `useNotificationPreferences`, `useUserConnectedAccounts`.
- Ensure robust concurrent fetching. If any hook errors, isolate the error to its respective card rather than crashing the whole view.

**2. State & Keybindings**
- Track `focusedCardIndex` (0 to 5) with `useState`.
- Use `useKeyboard` (only active when `props.focused` is true):
  - `j` / `Down` -> `Math.min(5, prev + 1)`
  - `k` / `Up` -> `Math.max(0, prev - 1)`
  - `Enter` -> invoke `props.onNavigate(sections[focusedCardIndex])`
  - `R` -> trigger `.refetch()` on hooks currently returning `isError: true`.

**3. Card Components (`SummaryCard`)**
- Create an internal or shared `<SummaryCard>` component accepting `title`, `isLoading`, `isError`, `isFocused`, and `children`.
- **Styling:** Wrap in `<box border="single" borderColor={isFocused ? 'primary' : 'border'}>`.
- **Loading State:** Render a skeleton text line (e.g., `<text color="muted">Loading...</text>`).
- **Error State:** Render `<text color="error">Failed to load. Press 'R' to retry.</text>`.
- **Ready State Implementations:**
  - **Profile:** Display `user.displayName || user.username` and `user.bio` (truncated).
  - **Emails:** Display count and masked primary (`a***e@example.com`).
  - **SSH Keys:** Count + relative date of the latest key using standard date utils.
  - **Tokens:** Active count.
  - **Notifications:** State (e.g., `<text color={prefs.enabled ? 'success' : 'warning'}>...</text>`).
  - **Connected Accounts:** Count + map of provider names joined by comma.

**4. Responsive Grid/List**
- Wrap the cards in a `<scrollbox>` so the user can scroll down if terminal height is insufficient.
- Use `flexDirection="column"` with a `gap={1}` between cards.

## Phase 4: Integration & E2E Testing

**File:** `e2e/tui/settings.test.ts`

Using `@microsoft/tui-test`, implement the following test blocks:

**1. Snapshot & Rendering Tests**
- Launch TUI, navigate to Settings. Capture `.toMatchSnapshot()` of the Home dashboard in `isLoading`, `isError`, and `ready` mock states.
- Capture snapshots at `120x40` (standard) and `80x24` (minimum, showing horizontal tabs instead of sidebar).

**2. Keyboard Interaction Tests**
- Verify `j` / `k` navigate the sidebar when `focusedZone === 'sidebar'`.
- Verify `Tab` shifts focus to the content area, and subsequent `j` / `k` moves the `focusedCardIndex` highlight within `SettingsHome`.
- Verify `Enter` on a focused summary card successfully transitions the `activeSection` state.
- Verify `1`-`7` number keys immediately switch the active section regardless of the focused zone.

**3. Resilience & Edge Cases**
- Mock an API failure for `useUserSSHKeys` and assert that the specific card renders the error boundary (Press 'R' to retry) while other cards render correctly.
- Simulate the `R` keypress and assert the mocked `refetch` function is called.
- Test missing optional properties (e.g., user with no bio or display name) to ensure no layout crashes or `undefined` text rendering.
- Test deep-linking: Execute TUI with `--screen settings` and assert the Settings screen is the active view on mount.