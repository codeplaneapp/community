# Engineering Specification: Settings Tab Container

## 1. Overview

The `SettingsTabContainer` is the layout and navigation shell for the Codeplane TUI's Settings screen. It implements a responsive two-pane design that adapts to the user's terminal dimensions. At standard and large breakpoints, it provides a persistent left sidebar for navigating between settings categories. At the minimum breakpoint (80x24), it collapses the sidebar into a horizontal tab bar at the top of the screen to maximize horizontal space for configuration forms and lists.

This container manages the active section state, handles all tab-related keyboard navigation (including numeric jumping and sequential cycling), orchestrates focus switching between the navigation zone and the content zone, and ensures the global breadcrumb and keybinding hints are kept up-to-date with the active context.

## 2. Architecture & Design

### 2.1 State Management

The container needs to manage two primary pieces of local state:
1. **Active Tab**: An integer index (0–6) or string enum representing the currently selected settings section. This should initialize from the screen's routing parameters (e.g., `params.section`) if deep-linked, defaulting to `0` (Home).
2. **Focus Zone**: An enumeration (`"nav"` | `"content"`) tracking whether the user's keyboard input is currently targeted at the navigation menu or the settings forms within the content area.

### 2.2 Sections

The settings area consists of 7 fixed sections, each associated with a numeric hotkey (1-7):
1. Home
2. Profile
3. Emails
4. SSH Keys
5. Tokens
6. Notifications
7. Connected Accounts

### 2.3 Responsive Layout

The container subscribes to terminal dimensions via the `useLayout()` hook (which returns the current breakpoint).

**Standard/Large Breakpoint (`breakpoint !== "minimum"`):**
- **Layout**: Horizontal flexbox (`flexDirection="row"`).
- **Sidebar**: Fixed width (e.g., 25%). Renders sections vertically. Displays the section number and title (e.g., `1 Home`).
- **Content**: Flex-grow remaining width (75%). Renders the active section's component.
- **Border**: A vertical border (`borderRight="single"`) separates the sidebar from the content.

**Minimum Breakpoint (`breakpoint === "minimum"`):**
- **Layout**: Vertical flexbox (`flexDirection="column"`).
- **Tab Bar**: Takes 1 row at the top. Renders sections horizontally, separated by pipes or spaces (e.g., `1 Home │ 2 Profile │ ...`). Can be horizontally scrollable if it exceeds terminal width.
- **Content**: Flex-grow remaining height. Renders the active section's component.
- **Border**: A horizontal border (`borderBottom="single"`) separates the tab bar from the content.

### 2.4 Keyboard Interaction Model

Keyboard interactions are context-sensitive based on the current Focus Zone and Layout.

**Global to the Container:**
- `1` - `7`: Directly jump to the corresponding section.
- `Tab`: Cycle Focus Zone (`nav` → `content` → `nav`).
- `Shift+Tab`: Cycle Focus Zone backwards (`content` → `nav` → `content`).

**When Focus Zone is `"nav"`:**
- **Sidebar (Vertical):** `j` / `Down` selects the next tab. `k` / `Up` selects the previous tab.
- **Tab Bar (Horizontal):** `l` / `Right` selects the next tab. `h` / `Left` selects the previous tab.
- `Enter`: Moves focus to `"content"`.

**When Focus Zone is `"content"`:**
- Keyboard input is delegated to the child component (forms, lists, etc.) rendered in the content area. `SettingsTabContainer` ignores structural keys (`j`, `k`, `Enter`) unless they bubble up unhandled, but intercepts `Tab`/`Shift+Tab` to escape back to `"nav"`.

### 2.5 AppShell Integration

- **Breadcrumbs**: As the active tab changes, the container must update the breadcrumb via the `useNavigation` hook (or by updating the screen entry) so the header reads: `Dashboard > Settings > Profile`.
- **Keybindings**: Uses `useScreen()` or `useScreenKeybindings()` to register the `1-7` hotkeys and `Tab`/`Shift+Tab` so they appear in the `?` Help overlay and status bar.

## 3. Implementation Plan

### Step 1: Define Tab Configuration
Create `apps/tui/src/screens/Settings/config.ts` to hold the definition of the 7 tabs to ensure consistency across the container and routing.
```typescript
export const SETTINGS_TABS = [
  { id: 'home', title: 'Home', hotkey: '1' },
  { id: 'profile', title: 'Profile', hotkey: '2' },
  { id: 'emails', title: 'Emails', hotkey: '3' },
  { id: 'ssh-keys', title: 'SSH Keys', hotkey: '4' },
  { id: 'tokens', title: 'Tokens', hotkey: '5' },
  { id: 'notifications', title: 'Notifications', hotkey: '6' },
  { id: 'connected-accounts', title: 'Connected Accounts', hotkey: '7' },
] as const;

export type SettingsTabId = typeof SETTINGS_TABS[number]['id'];
```

### Step 2: Implement the Container Component
Create `apps/tui/src/screens/Settings/SettingsTabContainer.tsx`.
- Import `useLayout`, `useTheme`, `useNavigation`, and `useKeyboard` / `useScreenKeybindings`.
- Initialize `activeTab` based on `navigation.currentScreen.params.tab` or default to `'home'`.
- Initialize `focusZone` to `'nav'`.
- Implement keyboard handlers:
  - Register `1-7` keybindings to set `activeTab`.
  - Register `Tab` and `Shift+Tab` to toggle `focusZone`.
  - When `focusZone === 'nav'`, capture `j/k` (if sidebar) or `h/l` (if horizontal) to cycle `activeTab`.
- Implement rendering:
  - Check `layout.breakpoint`.
  - If `"minimum"`, render a top `<box flexDirection="row">` for tabs.
  - Else, render a left `<box flexDirection="column" width="25%">` for the sidebar.
  - Map over `SETTINGS_TABS` to render each item. Apply `theme.primary` background or reverse video when the item is active AND `focusZone === 'nav'`. Apply a dim highlight when active but `focusZone === 'content'`.
  - Render the `children` prop inside the remaining flexible `<box>`. Pass the `focusZone === 'content'` state down via context or prop if child components need to know if they have focus.

### Step 3: Update SettingsScreen
Modify `apps/tui/src/screens/Settings/SettingsScreen.tsx` to utilize the new container.
- Map the `activeTab` state from the container to the corresponding sub-feature component (e.g., `<ProfileSettings />`, `<TokenSettings />`).
- If these sub-components don't exist yet, render placeholder text components (`<text>Profile Settings Stub</text>`).

### Step 4: Breadcrumb Synchronization
In `SettingsTabContainer.tsx`, use a `useEffect` on `activeTab` to update the breadcrumb.
```typescript
useEffect(() => {
  const tabConfig = SETTINGS_TABS.find(t => t.id === activeTab);
  navigation.updateCurrentBreadcrumb(`Settings > ${tabConfig?.title || 'Unknown'}`);
}, [activeTab, navigation]);
```

## 4. Unit & Integration Tests

Create `e2e/tui/settings.test.ts` using `@microsoft/tui-test`.

1. **Responsive Layout Render Test**:
   - **Action**: Launch TUI at 120x40. Navigate to Settings (`g`, `s` or deep link).
   - **Assertion**: Verify the terminal snapshot matches the golden file showing the left sidebar layout.
   - **Action**: Resize TUI to 80x24 (or launch at 80x24).
   - **Assertion**: Verify the snapshot matches the golden file showing the horizontal top tab bar.

2. **Keyboard Navigation (Sidebar/Vertical)**:
   - **Action**: Launch TUI at 120x40. Navigate to Settings. Focus is natively on `"nav"`.
   - **Action**: Press `j`.
   - **Assertion**: Active tab changes from `1 Home` to `2 Profile`. Breadcrumb updates to `Settings > Profile`.
   - **Action**: Press `k`.
   - **Assertion**: Active tab changes back to `1 Home`.

3. **Keyboard Navigation (Horizontal/Tab Bar)**:
   - **Action**: Launch TUI at 80x24. Navigate to Settings.
   - **Action**: Press `l`.
   - **Assertion**: Active tab changes to `2 Profile`.
   - **Action**: Press `h`.
   - **Assertion**: Active tab changes back to `1 Home`.

4. **Numeric Jump Navigation**:
   - **Action**: Launch TUI and navigate to Settings.
   - **Action**: Press `5`.
   - **Assertion**: Active tab changes directly to `5 Tokens`. Verify content area displays token stub.

5. **Focus Zone Switching**:
   - **Action**: Launch TUI, navigate to Settings.
   - **Action**: Press `Tab`.
   - **Assertion**: Focus shifts to `"content"`. The visual highlight on the sidebar dims or drops reverse video, indicating the list is no longer actively capturing vim-keys.
   - **Action**: Press `Shift+Tab`.
   - **Assertion**: Focus returns to `"nav"`. Sidebar highlight restores to active state.

6. **Keybinding Hint Verification**:
   - **Action**: Navigate to Settings. Press `?` to open the Help overlay.
   - **Assertion**: Assert that the text content of the overlay contains definitions for `1-7 (Jump to section)`, `Tab (Switch focus)`, and `j/k (Select section)`.