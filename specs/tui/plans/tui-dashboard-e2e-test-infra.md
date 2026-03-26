# Implementation Plan: `tui-dashboard-e2e-test-infra`

This implementation plan details the steps required to set up the robust end-to-end test infrastructure for the Codeplane TUI Dashboard screen. As per the engineering specification, all code will be placed within `e2e/tui/dashboard.test.ts`, extending the existing screen scaffold tests without modifying any application source code.

## Overview

The goal is to establish comprehensive test coverage placeholders and helpers for upcoming dashboard features (`tui-dashboard-repos-list`, `tui-dashboard-orgs-list`, etc.). Tests relying on unimplemented backend features will be explicitly written to fail, serving as a progress signal for future tickets.

## Step-by-Step Instructions

### Step 1: Define Test Fixture Interfaces
**File:** `e2e/tui/dashboard.test.ts`

At the top of the file (after the existing imports and before any test blocks), define standalone fixture interfaces. These should accurately reflect the API response shapes decoupled from `@codeplane/sdk` to maintain test independence.

- `RepoFixture`: Include `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `created_at`, `updated_at`.
- `OrgFixture`: Include `id`, `name`, `description`, `visibility` (`"public" | "limited" | "private"`), `website`, `location`.
- `ActivityFixture`: Include `id`, `event_type`, `action`, `actor_username`, `target_type`, `target_name`, `summary`, `created_at`.
- `UserFixture`: Include standard user fields (id, username, display_name, email, etc.).

### Step 2: Implement Fixture Data Arrays
**File:** `e2e/tui/dashboard.test.ts`

Immediately following the interfaces, instantiate the hardcoded fixture data arrays. Ensure all timestamps use fixed ISO strings (e.g., `"2026-03-20T14:30:00Z"`) to guarantee deterministic snapshot comparisons.

- **`testUser`**: A fully populated mock user.
- **`repoFixtures`**: 7 repositories testing various edge cases (long names, missing descriptions, high/low star counts, different owners).
- **`orgFixtures`**: 4 organizations spanning all three visibility types.
- **`starredRepoFixtures`**: 5 starred repos specifically focusing on high star counts (to test formatting like "25k").
- **`activityFixtures`**: 12 activity events encompassing all required event types (issues, landings, workflows, repo actions, comments).
- **Empty States**: Create empty equivalents (`emptyUser`, `emptyRepoFixtures`, `emptyOrgFixtures`, `emptyStarredRepoFixtures`, `emptyActivityFixtures`) to test 0-item rendering.

### Step 3: Create Dashboard-Specific Helper Functions
**File:** `e2e/tui/dashboard.test.ts`

Add reusable dashboard-centric test helpers to streamline complex interactions and assertions. These should leverage the shared `TUITestInstance`.

- `waitForDashboard(terminal)`: Waits for the "Dashboard" breadcrumb.
- `waitForDashboardPanelsLoaded(terminal)`: Waits for all 4 panel titles and the absence of "Loading…" text.
- `assertPanelFocused(terminal, panelIndex)`: Checks the terminal snapshot for the ANSI primary color escape sequence (`\x1b[33m` or `\x1b[38;5;33m`) near the expected panel's title.
- `assertScreenContent(terminal, pattern)`: A wrapper around `expect(terminal.snapshot()).toMatch(pattern)`.
- `captureSnapshot(terminal)`: Returns `terminal.snapshot()`.
- **Navigation Helpers**: `navigateToDashboard(terminal)`, `cyclePanelForward(terminal, times)`, `cyclePanelBackward(terminal, times)`, `navigateInPanel(terminal, direction, times)`.

### Step 4: Add New Describe Block for Full Infrastructure
**File:** `e2e/tui/dashboard.test.ts`

Append a new main describe block `describe("TUI_DASHBOARD — Full test infrastructure", () => { ... })` below the existing `TUI_DASHBOARD — Screen scaffold` block. This block must include a standard `afterEach` hook to guarantee cleanup:
```typescript
afterEach(async () => {
  if (terminal) await terminal.terminate();
});
```

### Step 5: Implement Test Suites (Test Cases)
**File:** `e2e/tui/dashboard.test.ts`

Within the new describe block, stub out and implement the ~50 requested tests, separated by inner describe blocks. Prefix test names explicitly with IDs starting at `101` to avoid scaffold test collisions.

1. **`Terminal Snapshot Tests` (`SNAP-DASH-101` to `115`)**
   - Validate populated layouts, empty states, and component formatting at `minimum`, `standard`, and `large` terminal sizes using `.toMatchSnapshot()`.
2. **`Keyboard Interaction Tests` (`KEY-DASH-101` to `120`)**
   - Validate `Tab` / `Shift+Tab` panel cycling, `j/k` panel navigation, list paging, action keybindings (`c`, `n`, `s`, `/`, `Enter`), and vim-style jumping (`g g`, `G`).
3. **`Responsive Tests` (`RESIZE-DASH-101` to `107`)**
   - Simulate layout transitions between single-column stacked (80x24) and full grid (120x40+), ensuring scroll and focus preservation.
4. **`Data Loading Tests` (`DATA-DASH-101` to `107`)**
   - Test concurrent loading indicators, 200-item caps, error display rendering, auth errors (401), and data caching behavior.
5. **`Edge Case Tests` (`EDGE-DASH-101` to `108`)**
   - Address layout stressors like rapidly interleaving resize & tab presses, extreme string lengths, missing fields, zero-match filters, and control character resistance.

### Step 6: Verify and Run
**Command:** `bun test e2e/tui/dashboard.test.ts`

Run the test suite. Given the project policy, tests explicitly checking for unbuilt features (like panel content matching or focus coloring) **must fail**. Do not use `.skip` or `.todo`. Verify that the snapshot capture points generate golden files for the assertions that can run, and ensure the test suite cleanly terminates the `TUITestInstance` instances without hanging.