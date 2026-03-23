# Implementation Plan: Settings Tab Container

## Overview
This plan outlines the implementation of the `SettingsTabContainer` for the Codeplane TUI. The container provides a responsive layout that switches between a vertical sidebar and a horizontal tab bar based on terminal dimensions. It handles keyboard navigation (vim-keys, numeric jumps, and focus cycling) between the navigation menu and the settings content area.

## Step 1: Define Tab Configuration

**File**: `apps/tui/src/screens/Settings/config.ts`
**Action**: Create a new file to centralize the settings tabs configuration.

**Details**:
- Export a constant array `SETTINGS_TABS` containing objects with `id`, `title`, and `hotkey`.
- Define and export the `SettingsTabId` type.

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

## Step 2: Implement the Tab Container Component

**File**: `apps/tui/src/screens/Settings/SettingsTabContainer.tsx`
**Action**: Create the responsive layout shell.

**Details**:
- Import necessary hooks: `useLayout`, `useTheme`, `useNavigation`, `useKeyboard` (from OpenTUI), and `useScreenKeybindings`.
- Define component props to accept `activeTab` (controlled or uncontrolled), `onTabChange`, and `children` (which could be a render prop passing `focusZone`).
- State management:
  - `activeTabIndex`: integer tracking the current tab (0-6).
  - `focusZone`: `'nav' | 'content'`.
- Implement `useKeyboard` to handle:
  - `1`-`7`: Jump to corresponding tab.
  - `Tab` / `Shift+Tab`: Toggle `focusZone`.
  - When `focusZone === 'nav'`:
    - If `layout.breakpoint === 'minimum'` (horizontal): `h`/`Left` (prev), `l`/`Right` (next).
    - If `layout.breakpoint !== 'minimum'` (vertical): `k`/`Up` (prev), `j`/`Down` (next).
  - `Enter`: Switch `focusZone` to `'content'` if currently `'nav'`.
- Implement `useScreenKeybindings` to register global screen hints for the status bar (e.g., `1-7: Jump`, `Tab: Focus`, `j/k: Select`).
- Layout rendering:
  - If `breakpoint === 'minimum'`:
    - Render a column `<box>`.
    - Top child: a row `<box>` for the tab bar, with a bottom border (`borderBottom="single"`). Iterate `SETTINGS_TABS` to render horizontal items.
    - Bottom child: flex-grow `<box>` for content.
  - Else:
    - Render a row `<box>`.
    - Left child: a column `<box width="25%">` for the sidebar, with a right border (`borderRight="single"`). Iterate `SETTINGS_TABS` to render vertical items.
    - Right child: flex-grow `<box width="75%">` for content.
- Styling:
  - Highlight the active tab differently depending on `focusZone`. Use reverse video or a primary background color when `focusZone === 'nav'`. Use a muted or dimmed highlight when `focusZone === 'content'`.

## Step 3: Implement the Settings Screen

**File**: `apps/tui/src/screens/Settings/SettingsScreen.tsx`
**Action**: Create the root screen component for Settings.

**Details**:
- Use `useNavigation` to read any initial tab from `currentScreen.params.section`.
- Maintain the state of the active tab (or let the container manage it and notify the screen).
- Update the breadcrumb dynamically: `navigation.updateCurrentBreadcrumb("Settings > " + activeTabTitle)`.
- Render `<SettingsTabContainer>`.
- Inside the container, render the content based on the active tab. For now, render placeholder `<text>` components (e.g., `<text>Profile Settings Stub</text>`) for each section.

## Step 4: Register the Screen

**File**: `apps/tui/src/router/registry.ts`
**Action**: Replace the placeholder with the real component.

**Details**:
- Import `SettingsScreen` from `../screens/Settings/SettingsScreen`.
- Update `[ScreenName.Settings]` to use `component: SettingsScreen` instead of `PlaceholderScreen`.

## Step 5: Implement E2E Tests

**File**: `e2e/tui/settings.test.ts`
**Action**: Create test coverage for the responsive layout and keyboard navigation.

**Details**:
- Use `bun:test` and test helpers.
- **Test 1: Responsive Layout**: Launch at 120x40, assert vertical sidebar snapshot. Resize/launch at 80x24, assert horizontal tab bar snapshot.
- **Test 2: Vertical Navigation**: Launch at 120x40. Verify focus is 'nav'. Press `j`, assert tab 2 is active. Press `k`, assert tab 1 is active.
- **Test 3: Horizontal Navigation**: Launch at 80x24. Press `l`, assert tab 2 is active. Press `h`, assert tab 1 is active.
- **Test 4: Numeric Jump**: Press `5`, assert tab 5 is active and content displays token stub.
- **Test 5: Focus Cycling**: Press `Tab`, assert focus shifts to 'content' (sidebar visual change). Press `Shift+Tab`, assert focus returns to 'nav'.
- **Test 6: Keybindings**: Press `?` and assert help overlay shows expected navigation hints.