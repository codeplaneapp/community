# Engineering Specification: Repository detail screen scaffold with tab routing

## 1. Overview
This specification details the implementation of the `RepoOverviewScreen` shell component for the Codeplane TUI. This screen serves as the primary navigation hub for a specific repository, providing a persistent header, a 6-tab routing system, and a content area that mounts the active tab's view. It strictly adheres to the TUI's stack-based navigation, keyboard-first interaction model, and OpenTUI layout primitives.

## 2. Technical Design

### 2.1 Component Architecture
The screen is composed of four primary layers:
1. **RepoContext Provider:** A React Context that wraps the screen content, injecting the fetched `Repository` object, `owner`, and `repo` strings so deep child components don't need to prop-drill or re-fetch basic repo metadata.
2. **RepoHeader:** A fixed-height `box` at the top of the screen displaying the `full_name` (e.g., `owner/repo`), a visibility badge (Public/Private), an archive badge (if applicable), and key repository stats (stars, forks).
3. **TabBar:** A horizontal navigation bar rendering 6 tabs: Bookmarks, Changes, Code, Conflicts, Operations, Settings. It highlights the active tab using the `primary` theme color.
4. **Content Area:** A flexible `box` that conditionally renders the component corresponding to the `activeTabIndex`. Crucially, inactive tab components are unmounted, preserving no state across switches (as per the specification).

### 2.2 Data Fetching & State
- **Metadata Hook:** The screen will call `useRepo(owner, repo)` (from `@codeplane/ui-core`). 
- **Loading & Error States:** While `isLoading` is true, a full-screen or localized `<text>` spinner placeholder is rendered. On `error`, an error message and retry prompt are displayed.
- **Tab State:** The `activeTabIndex` is stored as local React state (`useState`) ranging from `0` to `5`.

### 2.3 Keyboard Navigation
The screen registers a set of keybindings via `useScreenKeybindings`:
- `Tab` / `Shift+Tab`: Cycles the `activeTabIndex` forward and backward.
- `1` through `6`: Jumps directly to the corresponding tab index (0 to 5).
These bindings have screen-level priority, overriding standard list focus only when the event bubbles up.

## 3. Implementation Plan

### Step 1: Create the Repository Context
**File:** `apps/tui/src/context/RepoContext.tsx`
- Define `RepoContext` and a `useRepoContext()` hook.
- The context value shape should be:
  ```typescript
  interface RepoContextValue {
    owner: string;
    repoName: string; // avoiding 'repo' collision if needed, but 'repo' is fine
    repository: Repository; // from @codeplane/sdk
  }
  ```
- Export a `RepoProvider` component that accepts these values and `children`.

### Step 2: Implement `RepoHeader`
**File:** `apps/tui/src/components/repository/RepoHeader.tsx`
- Create a functional component consuming `useRepoContext()` and `useTheme()`.
- Use a `<box flexDirection="row" gap={2} paddingBottom={1} borderBottom="single" borderColor={theme.border}>`.
- Render the `full_name` in bold text.
- Render conditional badges for visibility (`Public`/`Private`) and `is_archived`. Badges should be enclosed in brackets or drawn with background colors depending on terminal capabilities (fallback to brackets `[Private]`).
- Render stats (e.g., `★ {repository.stars}`).

### Step 3: Implement `RepoTabBar`
**File:** `apps/tui/src/components/repository/RepoTabBar.tsx`
- Create a reusable or repo-specific tab bar component.
- Props: `tabs: string[]`, `activeIndex: number`.
- Render a horizontal `<box flexDirection="row" gap={3} paddingBottom={1}>`.
- Iterate through `tabs` (Bookmarks, Changes, Code, Conflicts, Operations, Settings).
- Render each tab as `<text fg={index === activeIndex ? theme.primary : theme.muted}>`.
- Prefix tabs with their index for visual hinting (e.g., `1:Bookmarks`).

### Step 4: Implement `RepoOverviewScreen`
**File:** `apps/tui/src/screens/repository/RepoOverviewScreen.tsx`
- **Props:** Extract `owner` and `repo` from `params` (passed by the screen router).
- **Hooks:** 
  - Call `const { repository, isLoading, error } = useRepo(owner, repo);`
  - Call `const { registerKeybinding } = useScreen({ name: "RepoOverview" });`
- **State:** `const [activeTabIndex, setActiveTabIndex] = useState(0);`
- **Keybindings:** Register `Tab` (index + 1 % 6), `Shift+Tab` (index - 1 % 6), and `1`-`6` (set index 0-5).
- **Conditional Rendering (Loading/Error):**
  - If `isLoading`: render `<box><text fg={theme.warning}>Loading repository...</text></box>`.
  - If `error`: render `<box><text fg={theme.error}>Error: {error.message}</text></box>`.
- **Render (Success):**
  - Wrap the main UI in `<RepoProvider>`.
  - Render a top-level `<box flexDirection="column" width="100%" height="100%">`.
  - Mount `<RepoHeader />` and `<RepoTabBar tabs={TABS} activeIndex={activeTabIndex} />`.
  - Create a `<box flexGrow={1}>` for the content area.
  - Use a `switch(activeTabIndex)` statement to render placeholder components for now (e.g., `<BookmarksTabStub />`, `<ChangesTabStub />`, etc.). This guarantees unmounting of inactive tabs.

### Step 5: Register the Screen
**File:** `apps/tui/src/navigation/screenRegistry.ts`
- Import `RepoOverviewScreen`.
- Add the entry to the registry:
  ```typescript
  RepoOverview: { 
    component: RepoOverviewScreen, 
    requiresRepo: true 
  },
  ```

## 4. Unit & Integration Tests

**File:** `e2e/tui/repository.test.ts`
Write the following E2E tests using `@microsoft/tui-test`:

1. **Loading State:**
   - Launch TUI and navigate to a repository directly via deep link (`--screen RepoOverview --repo owner/repo`).
   - Intercept/delay the API response.
   - Assert the terminal buffer contains the "Loading repository..." text.

2. **Render Header & Badges:**
   - Mock a successful `Repository` response (e.g., private, archived).
   - Assert the header correctly renders the repo full name, `[Private]`, and `[Archived]` badges via Regex text assertions on the first few lines of the terminal buffer.

3. **Tab Navigation (Keyboard Routing):**
   - Launch TUI into `RepoOverview`.
   - Send `Tab` keypress. Assert `activeTabIndex` updates (e.g., visually verify "2:Changes" is highlighted / rendered in primary color).
   - Send `Shift+Tab`. Assert focus returns to "1:Bookmarks".
   - Send `4` keypress. Assert focus jumps to "4:Conflicts" and the conflicts content stub is mounted in the content area (verified via text assertion of the stub's output).

4. **Component Unmounting Constraint:**
   - Ensure that when switching from Tab 1 to Tab 2, the text from Tab 1's content area is no longer present in the terminal buffer at all, verifying proper unmounting behavior.
