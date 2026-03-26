# Engineering Specification: `tui-search-screen-scaffold`

## Search screen scaffold — layout, screen registration, search input with debounce

**Ticket:** `tui-search-screen-scaffold`
**Status:** `Partial`
**Feature group:** `TUI_SEARCH`
**Feature tag:** `TUI_SEARCH_SCREEN`
**Dependencies:** `tui-screen-router`, `tui-responsive-layout`, `tui-goto-keybindings`, `tui-command-palette`

---

## 1. Overview

This ticket creates the `SearchScreen` component, the first real (non-placeholder) screen for the global search feature. It replaces the `PlaceholderScreen` registration for `ScreenName.Search` with a dedicated component that provides:

1. A search input with 300ms debounce, auto-focused on mount.
2. A tab bar placeholder area for future result type tabs (repos, issues, users, code).
3. A results area placeholder.
4. Status bar keybinding hints specific to the search screen.
5. Registration in the screen registry, the `g s` go-to binding, and the `:search` command palette entry.
6. An E2E test scaffold at `e2e/tui/search.test.ts`.

This is a scaffold ticket. It does **not** implement API integration, result rendering, tab switching, or pagination. Those are separate tickets (`TUI_SEARCH_REPOS_TAB`, `TUI_SEARCH_ISSUES_TAB`, etc.).

---

## 2. Files Changed

| File | Action | Purpose |
|------|--------|--------|
| `apps/tui/src/screens/Search/SearchScreen.tsx` | **Create** | Main search screen component |
| `apps/tui/src/screens/Search/useSearchInput.ts` | **Create** | Debounced search input state hook |
| `apps/tui/src/screens/Search/index.ts` | **Create** | Barrel export |
| `apps/tui/src/router/registry.ts` | **Edit** | Replace `PlaceholderScreen` → `SearchScreen` for `ScreenName.Search` |
| `e2e/tui/search.test.ts` | **Create** | E2E test scaffold |

No changes required to `router/types.ts` (`ScreenName.Search` already exists), `navigation/goToBindings.ts` (`g s` already mapped), or `components/GlobalKeybindings.tsx` (command palette wired separately).

---

## 3. Component Design

### 3.1 `SearchScreen` — `apps/tui/src/screens/Search/SearchScreen.tsx`

```typescript
import React, { useState, useCallback } from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useNavigation } from "../../providers/NavigationProvider.js";
import { useSearchInput } from "./useSearchInput.js";
```

**Props:** Standard `ScreenComponentProps` — `{ entry, params }`. The `params` object may contain an optional `q` string if navigated to with a pre-populated query (e.g., from command palette `:search <term>`).

**Layout:**

```
┌─────────────────────────────────────────────────┐
│ Header (rendered by AppShell — breadcrumb: Search) │
├─────────────────────────────────────────────────┤
│ 🔍 [search input ____________________________] │  ← row 0: search input
├─────────────────────────────────────────────────┤
│ [Repos] [Issues] [Users] [Code]                 │  ← row 1: tab bar placeholder
├─────────────────────────────────────────────────┤
│                                                 │
│        Type to search across Codeplane          │  ← remaining: results area
│                                                 │
├─────────────────────────────────────────────────┤
│ /:focus  Esc:back  Tab:next tab  q:quit         │  ← status bar (AppShell)
└─────────────────────────────────────────────────┘
```

**Component structure (JSX):**

```tsx
export function SearchScreen({ entry, params }: ScreenComponentProps) {
  const layout = useLayout();
  const theme = useTheme();
  const nav = useNavigation();

  const {
    query,
    debouncedQuery,
    inputFocused,
    setInputFocused,
    handleInput,
    handleClear,
  } = useSearchInput({
    initialQuery: params.q ?? "",
    debounceMs: 300,
    maxLength: 120,
  });

  // --- Keybindings ---
  useScreenKeybindings(
    [
      {
        key: "/",
        description: "Focus search",
        group: "Search",
        handler: () => setInputFocused(true),
        when: () => !inputFocused,
      },
      {
        key: "escape",
        description: "Unfocus / Back",
        group: "Search",
        handler: () => {
          if (inputFocused) {
            setInputFocused(false);
          } else {
            nav.pop();
          }
        },
      },
    ],
    [
      { keys: "/", label: "focus search", order: 10 },
      { keys: "Tab", label: "next tab", order: 20 },
      { keys: "Esc", label: "back", order: 30 },
    ],
  );

  // --- Render ---
  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Search input row */}
      <box flexDirection="row" height={1} width="100%" paddingLeft={1} paddingRight={1}>
        {layout.breakpoint !== "minimum" && (
          <text fg={theme.primary}>{"🔍 "}</text>
        )}
        <input
          focused={inputFocused}
          value={query}
          onInput={handleInput}
          placeholder="Search repositories, issues, users, code…"
          width="100%"
        />
      </box>

      {/* Tab bar placeholder */}
      <box flexDirection="row" height={1} width="100%" paddingLeft={1} borderColor={theme.border} border={["bottom"]}>
        {(layout.breakpoint === "minimum"
          ? ["Rep", "Iss", "Usr", "Cod"]
          : ["Repos", "Issues", "Users", "Code"]
        ).map((tab, i) => (
          <text key={tab} fg={i === 0 ? theme.primary : theme.muted}>
            {i === 0 ? `[${tab}]` : ` ${tab} `}
          </text>
        ))}
      </box>

      {/* Results area placeholder */}
      <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
        {debouncedQuery.length === 0 ? (
          <text fg={theme.muted}>Type to search across Codeplane</text>
        ) : (
          <text fg={theme.muted}>
            {`Searching for \"${debouncedQuery}\"…`}
          </text>
        )}
      </box>
    </box>
  );
}
```

**Key behaviors:**

1. **Auto-focus on mount:** `inputFocused` initializes to `true`. The `<input>` component receives `focused={true}` immediately, capturing printable key input at the OpenTUI level (PRIORITY.TEXT_INPUT, priority 1 — highest).

2. **Pre-populated query:** If `params.q` is set (from command palette or deep link), the input initializes with that value and the debounced query fires immediately.

3. **Tab bar is visual-only in this ticket.** The first tab ("Repos") renders in `theme.primary`; the rest in `theme.muted`. Tab switching is implemented in `TUI_SEARCH_TAB_NAVIGATION`.

4. **Results area placeholder:** Shows contextual empty state text. When `debouncedQuery` is non-empty, shows "Searching for…" text. Actual result rendering is implemented in subsequent tab tickets.

5. **Responsive behavior:**
   - At `minimum` breakpoint (80×24): Search icon is hidden, input uses full width, tab names are truncated to first 3 characters.
   - At `standard`/`large` breakpoints: Full layout as shown.

### 3.2 `useSearchInput` — `apps/tui/src/screens/Search/useSearchInput.ts`

A custom hook encapsulating the debounced search input state machine.

```typescript
import { useState, useRef, useCallback, useEffect } from "react";

export interface UseSearchInputOptions {
  /** Initial query string (e.g., from params.q). */
  initialQuery?: string;
  /** Debounce delay in milliseconds. Default: 300. */
  debounceMs?: number;
  /** Maximum query length in characters. Default: 120. */
  maxLength?: number;
}

export interface UseSearchInputReturn {
  /** The raw, undebounced query string (reflects every keystroke). */
  query: string;
  /** The debounced query string (updates after debounceMs of inactivity). */
  debouncedQuery: string;
  /** Whether the input is currently focused. */
  inputFocused: boolean;
  /** Set input focus state. */
  setInputFocused: (focused: boolean) => void;
  /** Handler for <input onInput={...}>. */
  handleInput: (value: string) => void;
  /** Clear the query and reset debounced state. */
  handleClear: () => void;
}
```

**State machine:**

| State | `query` | `debouncedQuery` | `inputFocused` |
|-------|---------|------------------|----------------|
| Initial (no params.q) | `""` | `""` | `true` |
| Initial (with params.q) | `params.q` | `params.q` | `true` |
| Typing | live value | stale value | `true` |
| Debounce fired | live value | live value | `true` |
| Input unfocused | preserved | preserved | `false` |
| Cleared (Ctrl+U) | `""` | `""` (immediate) | `true` |

**Debounce implementation:**

```typescript
export function useSearchInput(options: UseSearchInputOptions = {}): UseSearchInputReturn {
  const { initialQuery = "", debounceMs = 300, maxLength = 120 } = options;

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [inputFocused, setInputFocused] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = useCallback(
    (value: string) => {
      const clamped = value.slice(0, maxLength);
      setQuery(clamped);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        setDebouncedQuery(clamped);
        timerRef.current = null;
      }, debounceMs);
    },
    [debounceMs, maxLength],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { query, debouncedQuery, inputFocused, setInputFocused, handleInput, handleClear };
}
```

**Input edge cases:**

| Input event | Behavior |
|-------------|----------|
| Printable character | Appended to `query`, debounce timer restarted |
| Backspace | Last character removed from `query`, debounce timer restarted |
| `Ctrl+U` | Calls `handleClear()`: `query` and `debouncedQuery` both set to `""` immediately (no debounce). Timer cancelled. |
| Paste (>120 chars) | Clamped to 120 characters at `handleInput` level |
| `Esc` while focused | `setInputFocused(false)` — input loses focus, `query` preserved |
| `Esc` while unfocused | `nav.pop()` — return to previous screen |
| `/` while unfocused | `setInputFocused(true)` — input regains focus |

### 3.3 `index.ts` — `apps/tui/src/screens/Search/index.ts`

```typescript
export { SearchScreen } from "./SearchScreen.js";
```

---

## 4. Screen Registry Update

### `apps/tui/src/router/registry.ts`

**Change:** Replace the `PlaceholderScreen` import with `SearchScreen` for the `ScreenName.Search` entry.

**Before:**
```typescript
[ScreenName.Search]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Search",
},
```

**After:**
```typescript
import { SearchScreen } from "../screens/Search/index.js";
// ...
[ScreenName.Search]: {
  component: SearchScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Search",
},
```

**No other registry properties change.** The breadcrumb label remains `"Search"`, `requiresRepo` remains `false`, `requiresOrg` remains `false`.

---

## 5. Navigation Integration

### 5.1 Go-to keybinding: `g s`

**Already wired.** The `goToBindings` array at `apps/tui/src/navigation/goToBindings.ts` line 18 already contains:

```typescript
{ key: "s", screen: ScreenName.Search, requiresRepo: false, description: "Search" },
```

No code change needed. The `g s` sequence will navigate to the newly registered `SearchScreen` via `executeGoTo()` → `nav.reset(Dashboard)` → `nav.push(Search)`.

### 5.2 Command palette: `:search`

**Deferred.** The command palette content is not yet implemented (the `OverlayLayer` shows a placeholder for `command-palette`). The `:search` command entry will be added when the `tui-command-palette` ticket lands. This spec documents the expected entry for coordination:

```typescript
{
  id: "search",
  label: "Search",
  aliases: ["find", "search"],
  description: "Open global search",
  handler: (nav) => nav.push(ScreenName.Search),
  argParser: (input) => {
    const match = input.match(/^:search\\s+(.+)$/);
    return match ? { q: match[1].trim() } : undefined;
  },
}
```

### 5.3 Deep link

The screen router already supports `params` passthrough. A deep link like:

```bash
codeplane tui --screen Search --param q="react hooks"
```

will push `SearchScreen` with `params.q = "react hooks"`, which `useSearchInput` will consume as `initialQuery`.

---

## 6. Keybinding Specification

### 6.1 Screen-level keybindings (PRIORITY.SCREEN = 4)

Registered via `useScreenKeybindings()` in `SearchScreen`:

| Key | Description | Group | Behavior | `when` guard |
|-----|-------------|-------|----------|---------------|
| `/` | Focus search | Search | `setInputFocused(true)` | `!inputFocused` |
| `escape` | Unfocus / Back | Search | If `inputFocused`: `setInputFocused(false)`. Else: `nav.pop()`. | none |

### 6.2 Input-level key handling (PRIORITY.TEXT_INPUT = 1)

When `inputFocused === true`, the OpenTUI `<input>` component captures printable keys at the highest priority:

| Key | Behavior |
|-----|----------|
| Printable characters | Appended to input value, `handleInput()` called |
| `Backspace` | Deletes last character, `handleInput()` called with shortened value |
| `Ctrl+U` | Calls `handleClear()` — clears entire input immediately |

### 6.3 Status bar hints

| `keys` | `label` | `order` |
|--------|---------|--------|
| `/` | `focus search` | 10 |
| `Tab` | `next tab` | 20 |
| `Esc` | `back` | 30 |

---

## 7. Responsive Layout Behavior

| Breakpoint | Search icon | Input width | Tab labels | Results area |
|-----------|-------------|-------------|------------|-------------|
| `minimum` (80×24) | Hidden | `100%` minus padding | `Rep Iss Usr Cod` (3-char abbreviations) | Centered placeholder text |
| `standard` (120×40) | `🔍 ` visible | `100%` minus icon and padding | `Repos Issues Users Code` | Centered placeholder text |
| `large` (200×60) | `🔍 ` visible | `100%` minus icon and padding | `Repos Issues Users Code` | Centered placeholder text |

---

## 8. Implementation Plan

### Step 1: Create `useSearchInput` hook

**File:** `apps/tui/src/screens/Search/useSearchInput.ts`

1. Implement the hook with `query`, `debouncedQuery`, `inputFocused` state.
2. Implement `handleInput` with `maxLength` clamping and debounce via `setTimeout`.
3. Implement `handleClear` with immediate state reset and timer cancellation.
4. Add cleanup effect to cancel timer on unmount.
5. Accept `initialQuery` from options for pre-populated query support.

**Acceptance criteria:**
- `query` updates synchronously on every call to `handleInput`.
- `debouncedQuery` updates 300ms after the last `handleInput` call.
- `handleClear()` sets both `query` and `debouncedQuery` to `""` immediately.
- Input longer than 120 characters is clamped.
- Timer is cancelled on unmount (no setState after unmount).

### Step 2: Create `SearchScreen` component

**File:** `apps/tui/src/screens/Search/SearchScreen.tsx`

1. Import `ScreenComponentProps`, `useLayout`, `useTheme`, `useScreenKeybindings`, `useNavigation`, `useSearchInput`.
2. Initialize `useSearchInput` with `params.q` as `initialQuery`.
3. Register screen keybindings: `/` to refocus, `escape` for unfocus/back.
4. Register explicit status bar hints.
5. Render three-zone layout: search input row, tab bar row, results area.
6. Apply responsive breakpoint adaptations (hide icon at minimum, truncate tab labels).

**Acceptance criteria:**
- Renders search input auto-focused on mount.
- `debouncedQuery` text appears in results area placeholder after 300ms.
- `/` re-focuses input when unfocused.
- `Esc` unfocuses input when focused, pops screen when unfocused.
- Status bar shows search-specific hints.
- Tab bar shows four tab labels (visual only, not interactive).

### Step 3: Create barrel export

**File:** `apps/tui/src/screens/Search/index.ts`

1. Export `SearchScreen` from `./SearchScreen.js`.

### Step 4: Update screen registry

**File:** `apps/tui/src/router/registry.ts`

1. Add import: `import { SearchScreen } from "../screens/Search/index.js";`
2. Replace `component: PlaceholderScreen` with `component: SearchScreen` in the `ScreenName.Search` entry.
3. All other properties (`requiresRepo`, `requiresOrg`, `breadcrumbLabel`) remain unchanged.

**Acceptance criteria:**
- `ScreenName.Search` resolves to `SearchScreen` component.
- `g s` navigates to the new `SearchScreen` (not placeholder).
- Breadcrumb shows "Search" in header bar.

### Step 5: Create E2E test scaffold

**File:** `e2e/tui/search.test.ts`

1. Import test helpers from `./helpers.ts`.
2. Create test suite structure covering scaffold-level behaviors.
3. Tests run against `launchTUI()` with standard terminal size.

---

## 9. Unit & Integration Tests

### E2E Test Suite: `TUI_SEARCH — Screen scaffold`

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, TERMINAL_SIZES, type TUITestInstance } from "./helpers.ts";

describe("TUI_SEARCH — Screen scaffold", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("search screen renders via g s navigation", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    await tui.waitForText("Type to search across Codeplane");
  });

  test("search input is auto-focused on mount", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    await tui.sendText("hello");
    await tui.waitForText("hello");
  });

  test("Esc unfocuses input then pops screen", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    await tui.sendKeys("Escape");
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Type to search");
  });

  test("/ refocuses search input after Esc", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    await tui.sendKeys("Escape");
    await tui.sendKeys("/");
    await tui.sendText("test");
    await tui.waitForText("test");
  });

  test("search screen renders at 80x24 minimum size", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
  });

  test("breadcrumb shows Search in header bar", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    const headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/Search/);
  });

  test("status bar shows search-specific keybinding hints", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/\//);
    expect(statusLine).toMatch(/focus/i);
  });

  test("q pops screen when input is unfocused", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    await tui.sendKeys("Escape");
    await tui.sendKeys("q");
    await tui.waitForNoText("Type to search");
  });

  test("Ctrl+U clears search input", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
    await tui.sendText("react");
    await tui.waitForText("react");
    await tui.sendKeys("ctrl+u");
    await tui.waitForText("Type to search across Codeplane");
  });
});
```

### Integration verification

| Integration point | Verification |
|-------------------|-------------|
| Screen registry | E2E: `g s` navigates to SearchScreen, not PlaceholderScreen (verified by presence of "Type to search" text) |
| Breadcrumb | E2E: header bar line contains "Search" after `g s` navigation |
| Status bar hints | E2E: status bar line contains `/` and `focus` text |
| Keybinding priority | E2E: when input is focused, pressing `q` types "q" (not quit). When unfocused, pressing `q` navigates back. |
| Responsive layout | E2E: screen renders without crash at 80×24, 120×40, and 200×60 |
| Navigation pop | E2E: `Esc` when unfocused returns to previous screen |
| TypeScript compilation | Existing `bun run check` (`tsc --noEmit`) must pass with the new files |

---

## 10. Edge Cases and Error Handling

| Edge case | Expected behavior |
|-----------|------------------|
| Terminal resized while on search screen | Layout recalculates synchronously. Icon visibility and tab label truncation adapt. No crash. |
| Navigate to search screen when already on search screen | Navigation `push` deduplicates — same screen + same params = no-op. |
| Very fast typing (burst >10 chars) | Each keystroke updates `query` synchronously. Only the final debounce timer fires `debouncedQuery`. |
| Navigate away during debounce timer | Timer cleanup effect fires on unmount. No state update after unmount. |
| Empty query after clearing | Results area shows "Type to search", not empty string artifact. |
| Non-ASCII input (e.g., CJK, emoji) | `maxLength` clamps by character count (not byte count). |
| `params.q` contains special characters | Passed through to input value as-is. No escaping needed at this layer. |

---

## 11. Out of Scope

- API integration (`useSearch()` hook from `@codeplane/ui-core`)
- Result rendering (repo list, issue list, user list, code results)
- Tab switching logic (`TUI_SEARCH_TAB_NAVIGATION`)
- Tab content components (`TUI_SEARCH_REPOS_TAB`, `TUI_SEARCH_ISSUES_TAB`, etc.)
- Inline filtering within tabs (`TUI_SEARCH_INLINE_FILTER`)
- Pagination of search results
- Command palette implementation (`:search` entry documented for coordination only)
- SSE-based search suggestions

---

## 12. Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| `tui-screen-router` | ✅ Implemented | `ScreenRouter`, `ScreenName`, `screenRegistry` all exist |
| `tui-responsive-layout` | ✅ Implemented | `useLayout()`, breakpoint detection, `useTerminalDimensions()` all exist |
| `tui-goto-keybindings` | ✅ Implemented | `goToBindings` includes `g s` → `ScreenName.Search` |
| `tui-command-palette` | ⏳ Not yet | `:search` entry documented but not wirable until command palette lands |