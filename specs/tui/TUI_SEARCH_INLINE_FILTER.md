# TUI_SEARCH_INLINE_FILTER

Specification for TUI_SEARCH_INLINE_FILTER — per-tab inline filtering on the global search screen.

## High-Level User POV

The inline filter feature adds tab-specific filtering controls to the global search screen. While the search query itself (`🔍` input at the top of the screen) drives the cross-repository full-text search across all four entity types, inline filters let the user narrow results within a specific tab without changing the global query. Each tab can define its own set of filter dimensions relevant to its entity type. Filters refine results after the search query has returned — they do not replace the search query, they layer on top of it.

When the user is browsing search results on any tab, pressing `f` activates the inline filter bar. This is a single-line toolbar that appears immediately below the tab bar and above the results scrollbox. The filter bar contains a set of labeled filter controls that vary per tab. The user interacts with filter dimensions using dedicated single-key shortcuts. Each filter change takes effect immediately: the results list updates in real-time, either by re-querying the server with updated parameters (for server-supported filters) or by applying a client-side predicate against the loaded results (for filters not yet supported by the API).

On the **Issues tab**, the inline filter bar offers three dimensions: **State** (`o` to cycle Open → Closed → All), **Label** (`l` to open a label picker — though cross-repository label filtering is client-side against loaded data), and **Repository** (`r` to open a repository scope picker, narrowing results to a single repo). On the **Repositories tab**, the inline filter bar offers **Visibility** (`v` to cycle Public → Private → All) and **Language** (`l` to open a language picker from loaded result metadata). On the **Code tab**, the inline filter bar offers **Language** (`l` to cycle or pick from detected languages in results) and **Repository** (`r` to scope results to a single repo). On the **Users tab**, no inline filters are shown — the search query alone is sufficient for user discovery.

The filter bar renders as a compact row: `State: [Open] │ Repo: acme/api-gateway │ x:clear`. Active filter values are displayed in `primary` color. The `[bracketed]` value indicates the currently selected option. Non-default filters display their chips; default/inactive filters are hidden from the bar to save space. Pressing `x` clears all inline filters across the active tab, returning to the unfiltered result set.

Inline filters are tab-local. Switching from the Issues tab (with a State filter active) to the Code tab does not carry the state filter over. When the user returns to the Issues tab, the previously set state filter is restored. Inline filters are session-scoped: they persist as long as the search screen is in the navigation stack, but reset when the search screen is popped or the TUI exits.

When a server-supported filter changes (e.g., issue state), only the affected tab's API endpoint is re-queried — the other three tabs are not disturbed. This is consistent with the TUI_SEARCH_ISSUES_TAB specification's `o` keybinding for state cycling. The inline filter feature unifies and extends that pattern across all tabs with a visible filter toolbar.

At the minimum 80×24 terminal size, the filter bar collapses to a condensed format showing only the most important active filter value (e.g., `[Open]` for issues, `[Public]` for repos) and a `+N` indicator if additional filters are active. At standard 120×40 size, all filter chips are visible inline separated by `│`. At large 200×60+ size, the same layout as standard applies with additional padding.

The filter bar is toggled by `f` and dismissed by `f` again or `Esc` when focus is on the filter bar. The filter bar does not steal focus from the results list by default — filter keybindings (`o`, `l`, `r`, `v`, `x`) are active from the results list context when the filter bar is visible. This means the user can navigate results with `j`/`k` and adjust filters with `o`/`l`/`r` without extra mode-switching.

Picker overlays for label, language, and repository filters use the same compact modal pattern as TUI_ISSUE_LIST_FILTERS: centered on screen, fuzzy-searchable with `j`/`k` navigation, `Enter` to confirm, `Esc` to dismiss. Label pickers support multi-select via `Space`; language and repository pickers are single-select.

## Acceptance Criteria

### Definition of Done

- [ ] Pressing `f` from the results list on any tab (except Users) toggles the inline filter bar visibility
- [ ] The filter bar renders as a single-line row between the tab bar and the results scrollbox
- [ ] The filter bar shows only non-default active filter chips, each labeled with dimension name and value
- [ ] Filter chips are separated by `│` (U+2502 box-drawing character)
- [ ] Active filter values render in `primary` color (ANSI 33)
- [ ] Filter dimension labels render in `muted` color (ANSI 245)
- [ ] Pressing `x` from the results list (when filter bar is visible) clears all tab-local inline filters
- [ ] Clearing all filters hides the filter bar (returns to default state where `f` re-shows it)
- [ ] Filter changes take effect immediately: server-side filters re-query the tab's endpoint; client-side filters re-filter loaded results
- [ ] Filter state is tab-local: each tab maintains its own independent filter values
- [ ] Switching tabs and returning restores the previous tab's filter state
- [ ] Filter state persists within the search screen session (navigation away and back preserves filters)
- [ ] Filters reset when the search screen is popped from the navigation stack
- [ ] Filters are not persisted across TUI sessions
- [ ] The filter bar never exceeds 1 line height
- [ ] When no filters are active, the filter bar is hidden (no empty bar shown)
- [ ] The results count on the tab badge reflects the server-side total; a secondary "(showing M)" indicator appears when client-side filters further reduce the visible set

### Issues Tab Filters

- [ ] `o` cycles the state filter: All → Open → Closed → All (server-side filter via `state` API parameter)
- [ ] State filter change re-queries only `GET /api/search/issues?q={query}&state={state}` — other tabs unaffected
- [ ] State filter change resets pagination to page 1
- [ ] State filter default is "All" (no `state` parameter sent)
- [ ] `l` opens a label picker overlay populated from labels present in loaded issue results (client-side extraction)
- [ ] Label picker supports multi-select via `Space`, confirmed with `Enter`
- [ ] Selected labels apply as a client-side AND filter (issue must have all selected labels)
- [ ] `r` opens a repository picker overlay populated from unique `owner/repo` values in loaded issue results
- [ ] Repository picker is single-select; selecting a repo scopes results client-side to that repo only
- [ ] Repository picker includes a "(All repositories)" option at the top to clear the repo filter
- [ ] Filter bar displays active chips: `State: [Open] │ Label: bug, enhancement │ Repo: acme/api-gateway`

### Repositories Tab Filters

- [ ] `v` cycles the visibility filter: All → Public → Private → All (client-side filter)
- [ ] `l` opens a language picker overlay populated from unique `language` values in loaded repo results
- [ ] Language picker is single-select; `Enter` confirms; `Esc` dismisses
- [ ] Language filter applies client-side against loaded results
- [ ] Filter bar displays: `Visibility: [Public] │ Language: TypeScript`

### Code Tab Filters

- [ ] `l` opens a language picker overlay populated from unique languages detected in loaded code results (inferred from file extension)
- [ ] Language picker is single-select
- [ ] `r` opens a repository picker overlay populated from unique `owner/repo` values in loaded code results
- [ ] Repository picker is single-select with "(All repositories)" option
- [ ] Filter bar displays: `Language: Go │ Repo: acme/api-gateway`

### Users Tab

- [ ] The Users tab shows no inline filter bar; pressing `f` on the Users tab is a no-op
- [ ] No filter-related keybindings (`o`, `l`, `r`, `v`, `x`) are active on the Users tab

### Keyboard Interactions

- [ ] `f`: Toggle filter bar visibility on the active tab (no-op on Users tab)
- [ ] `o`: Cycle state filter (Issues tab only; no-op on other tabs)
- [ ] `v`: Cycle visibility filter (Repositories tab only; no-op on other tabs)
- [ ] `l`: Open label picker (Issues tab) or language picker (Repositories/Code tabs); no-op on Users tab
- [ ] `r`: Open repository scope picker (Issues/Code tabs); no-op on Repositories/Users tabs
- [ ] `x`: Clear all inline filters for the active tab
- [ ] `Esc` (while picker overlay is open): Dismiss picker without applying changes
- [ ] `Enter` (while picker overlay is open): Confirm selection and close picker
- [ ] `j`/`k`/`Down`/`Up` (while picker overlay is open): Navigate picker list
- [ ] `Space` (while label picker is open): Toggle selection on focused label
- [ ] `/` (while picker overlay is open): Focus picker search input for fuzzy search
- [ ] All filter keybindings are suppressed when the search input (`🔍`) is focused — keys type as literal characters
- [ ] All filter keybindings are suppressed when no filter bar is visible (except `f` which toggles it)
- [ ] After closing a picker overlay, focus returns to the results list

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the app shell (no filter bar rendered)
- [ ] 80×24 – 119×39 (minimum): Filter bar shows only the most significant active filter value and `+N filters` count if additional filters are active. Picker overlays use 90% terminal width
- [ ] 120×40 – 199×59 (standard): Filter bar shows all filter chips inline with `│` separators. Picker overlays use 60% terminal width
- [ ] 200×60+ (large): Same as standard with additional horizontal padding. Picker overlays use 50% terminal width and show descriptions alongside items
- [ ] Terminal resize re-lays out the filter bar at the new breakpoint without losing filter state

### Truncation and Boundary Constraints

- [ ] Filter bar total width: constrained to terminal width; excess chips collapsed to `…+N more`
- [ ] State filter values: fixed enum ("All", "Open", "Closed"), never truncated
- [ ] Visibility filter values: fixed enum ("All", "Public", "Private"), never truncated
- [ ] Label names in filter chips: max 20 characters, truncated with `…`
- [ ] Multiple label chips: if combined width exceeds available space, excess labels collapsed to `…+N`
- [ ] Maximum selectable labels: 10
- [ ] Language names in filter chips: max 20 characters, truncated with `…`
- [ ] Repository names in filter chips: max 30 characters, truncated with `…`
- [ ] Picker overlay item count: max 100 displayed; "Showing first 100 of N" footer if more exist
- [ ] Picker overlay search input: max 60 characters
- [ ] Picker overlay width: 90% at minimum, 60% at standard, 50% at large breakpoint
- [ ] Picker overlay height: max 60% of terminal height
- [ ] Filter bar `│` separator: U+2502 box-drawing character, rendered in `border` color (ANSI 240)

### Edge Cases

- [ ] No labels exist in loaded issue results: label picker shows "No labels found in results" in muted text
- [ ] No languages detected in loaded code results: language picker shows "No languages detected" in muted text
- [ ] Only one repository in loaded results: repository picker shows single repo pre-selected; selecting it is effectively a no-op
- [ ] Client-side filter reduces visible results to zero: results area shows "No results match the current filters." with "Press `x` to clear filters." hint
- [ ] Filter active when query changes: filters are preserved; new results are filtered through active filters
- [ ] Server-side filter (state) change while pagination is loading: in-flight request aborted; new request dispatched from page 1
- [ ] Client-side filter change while pagination is loading: filter applied to currently loaded items; incoming page items will also be filtered when they arrive
- [ ] Rapid `o` presses: each press cycles to the next state; server re-query debounced at 150ms from last press
- [ ] Terminal resize while filter bar is visible: bar re-lays out at new breakpoint; active filter state preserved
- [ ] Terminal resize while picker overlay is open: picker re-centers and resizes to fit new dimensions
- [ ] Picker opened with zero items: picker body shows empty state message; `Enter` is a no-op; only `Esc` dismisses
- [ ] Label with special characters (emoji, unicode): rendered correctly; fuzzy search matches against full grapheme string
- [ ] Language value is null/undefined for some results: those results pass through the language filter when "All" is selected, excluded when any specific language is active
- [ ] Tab switch while picker overlay is open: picker is dismissed, tab switches normally
- [ ] `f` pressed while picker overlay is open: picker dismissed, filter bar hidden
- [ ] Results loaded across multiple pages: client-side filters apply to all loaded items across all pages
- [ ] Filter active when pagination loads new page: new items are immediately filtered; only matching items appear in the list
- [ ] SSE disconnect: inline filters unaffected (uses REST endpoints)
- [ ] 429 rate limit on filter-triggered re-query: "Rate limited. Retry in {N}s." shown on affected tab
- [ ] Filter bar visible at minimum terminal size with 3+ active filters: shows primary filter + "+2 filters" condensed indicator

## Design

### Layout Structure — Filter Bar Visible

**Standard layout (120×40) — Issues tab with state and label filters active:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Search                                                    │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 api timeout█                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Repositories (3) │ ▸Issues (12) │ Users (1) │ Code (27)          │
├─────────────────────────────────────────────────────────────────┤
│ State: [Open] │ Label: bug │ Repo: all                 x:clear   │
├─────────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway  #42  Fix gateway timeout on large…  ● open 2h│
│   acme/api-gateway  #38  Rate limiting returns 500 on…  ● open 3d│
│   acme/gateway-sdk  #15  SDK does not handle timeout…   ● open 1w│
│                                                                  │
│                                              (showing 3 of 12)   │
├─────────────────────────────────────────────────────────────────┤
│ f:filter  o:state  l:label  r:repo  x:clear  j/k:nav  q:back    │
└─────────────────────────────────────────────────────────────────┘
```

**Minimum layout (80×24) — Issues tab with state filter active:**

```
┌──────────────────────────────────────────────────────────────┐
│ Search                                                         │
├──────────────────────────────────────────────────────────────┤
│ 🔍 api timeout█                                               │
├──────────────────────────────────────────────────────────────┤
│ Repos(3) ▸Issues(12) Users(1) Code(27)                         │
├──────────────────────────────────────────────────────────────┤
│ [Open] +1 filter                                    x:clear    │
├──────────────────────────────────────────────────────────────┤
│ ► #42 Fix gateway timeout on large payload…         ● open     │
│   #38 Rate limiting returns 500 on burst…           ● open     │
│   #15 SDK does not handle timeout gracefull…        ● open     │
├──────────────────────────────────────────────────────────────┤
│ f:filter o:state x:clear j/k:nav q:back                        │
└──────────────────────────────────────────────────────────────┘
```

**Standard layout (120×40) — Repositories tab with visibility filter:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Search                                                    │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 api gateway█                                                  │
├─────────────────────────────────────────────────────────────────┤
│ ▸Repositories (3) │ Issues (12) │ Users (1) │ Code (27)          │
├─────────────────────────────────────────────────────────────────┤
│ Visibility: [Public]                                   x:clear   │
├─────────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway                                    ◆ public  │
│     REST API gateway service for microservices…        ★ 42     │
│   acme/gateway-sdk                                    ◆ public  │
│     Client SDK for the API gateway…                    ★ 15     │
│                                                                  │
│                                               (showing 2 of 3)   │
├─────────────────────────────────────────────────────────────────┤
│ f:filter  v:visibility  l:language  x:clear  j/k:nav  q:back    │
└─────────────────────────────────────────────────────────────────┘
```

**Picker overlay — Label multi-select (standard 120×40):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Search                                                    │
├──────────────────────────────────────────────────────┬──────────┤
│ 🔍 api timeout█                                     │          │
├──────────────────────────────────────────────────────┤          │
│ Repos(3) ▸Issues(12) Users(1) Code(27)              │          │
├──────────────────────────────────────────────────────┤          │
│   ┌──────────── Select Labels ──────────────┐       │          │
│   │ /  filter labels…█                      │       │          │
│   ├─────────────────────────────────────────┤       │          │
│   │ [✓] ● bug                                │       │          │
│   │ [ ] ● enhancement                        │       │          │
│   │ [ ] ● documentation                      │       │          │
│   │ [ ] ● good first issue                   │       │          │
│   │ [ ] ● help wanted                        │       │          │
│   ├─────────────────────────────────────────┤       │          │
│   │ Space:toggle  Enter:confirm  Esc:cancel  │       │          │
│   └─────────────────────────────────────────┘       │          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Space:toggle  Enter:confirm  Esc:cancel                          │
└─────────────────────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI + React 19)

```jsx
{/* Filter bar — rendered when filterBarVisible && activeTab !== "users" */}
{filterBarVisible && activeTab !== "users" && (
  <box flexDirection="row" height={1} width="100%">
    {/* Render active filter chips based on activeTab */}
    {activeTab === "issues" && (
      <>
        {issueFilters.state !== "all" && (
          <>
            <text fg="muted">State: </text>
            <text fg="primary" attributes={BOLD}>[{capitalize(issueFilters.state)}]</text>
            <text fg="border"> │ </text>
          </>
        )}
        {issueFilters.labels.length > 0 && (
          <>
            <text fg="muted">Label: </text>
            <text fg="primary">{formatLabels(issueFilters.labels, maxLabelWidth)}</text>
            <text fg="border"> │ </text>
          </>
        )}
        {issueFilters.repo && (
          <>
            <text fg="muted">Repo: </text>
            <text fg="primary">{truncate(issueFilters.repo, 30)}</text>
            <text fg="border"> │ </text>
          </>
        )}
      </>
    )}

    {activeTab === "repositories" && (
      <>
        {repoFilters.visibility !== "all" && (
          <>
            <text fg="muted">Visibility: </text>
            <text fg="primary" attributes={BOLD}>[{capitalize(repoFilters.visibility)}]</text>
            <text fg="border"> │ </text>
          </>
        )}
        {repoFilters.language && (
          <>
            <text fg="muted">Language: </text>
            <text fg="primary">{truncate(repoFilters.language, 20)}</text>
            <text fg="border"> │ </text>
          </>
        )}
      </>
    )}

    {activeTab === "code" && (
      <>
        {codeFilters.language && (
          <>
            <text fg="muted">Language: </text>
            <text fg="primary">{truncate(codeFilters.language, 20)}</text>
            <text fg="border"> │ </text>
          </>
        )}
        {codeFilters.repo && (
          <>
            <text fg="muted">Repo: </text>
            <text fg="primary">{truncate(codeFilters.repo, 30)}</text>
            <text fg="border"> │ </text>
          </>
        )}
      </>
    )}

    {/* Right-aligned clear hint */}
    <box flexGrow={1} />
    <text fg="muted">x:clear</text>
  </box>
)}

{/* Picker overlay — absolute positioned, rendered on top */}
{pickerOpen && (
  <box
    position="absolute"
    top="center"
    left="center"
    width={pickerWidth}
    height={pickerHeight}
    border="single"
    borderColor="border"
  >
    <box flexDirection="column" width="100%">
      <text fg="primary" attributes={BOLD}>{pickerTitle}</text>
      <input
        placeholder={`Filter ${pickerEntityName}…`}
        value={pickerSearchQuery}
        onChange={setPickerSearchQuery}
        maxLength={60}
      />
      <scrollbox flexGrow={1}>
        {filteredPickerItems.map((item, i) => (
          <box
            key={item.value}
            flexDirection="row"
            height={1}
            bg={i === pickerFocusIndex ? "reverse" : undefined}
          >
            {pickerMultiSelect && (
              <text>{item.selected ? "[✓]" : "[ ]"} </text>
            )}
            {item.colorDot && <text fg={item.colorDot}>● </text>}
            <text>{truncate(item.label, pickerItemMaxWidth)}</text>
          </box>
        ))}
      </scrollbox>
      <box flexDirection="row" height={1}>
        <text fg="muted">
          {pickerMultiSelect ? "Space:toggle  " : ""}Enter:confirm  Esc:cancel
        </text>
      </box>
    </box>
  </box>
)}
```

### Filter Bar Collapsed Format (Minimum Breakpoint)

At 80×24, the filter bar uses a condensed format:

```jsx
<box flexDirection="row" height={1} width="100%">
  {/* Show only the "primary" filter value */}
  <text fg="primary" attributes={BOLD}>
    [{primaryFilterDisplayValue}]
  </text>
  {/* Show count of additional active filters */}
  {additionalFilterCount > 0 && (
    <text fg="muted"> +{additionalFilterCount} filter{additionalFilterCount > 1 ? "s" : ""}</text>
  )}
  <box flexGrow={1} />
  <text fg="muted">x:clear</text>
</box>
```

Primary filter precedence: State (issues), Visibility (repositories), Language (code).

### Keybinding Reference

| Key | Context | Tab | Action |
|-----|---------|-----|--------|
| `f` | Results list | Repos, Issues, Code | Toggle filter bar visibility |
| `f` | Results list | Users | No-op |
| `o` | Results list, filter bar visible | Issues | Cycle state: All → Open → Closed → All |
| `v` | Results list, filter bar visible | Repos | Cycle visibility: All → Public → Private → All |
| `l` | Results list, filter bar visible | Issues | Open label picker overlay |
| `l` | Results list, filter bar visible | Repos, Code | Open language picker overlay |
| `r` | Results list, filter bar visible | Issues, Code | Open repository scope picker overlay |
| `x` | Results list, filter bar visible | Repos, Issues, Code | Clear all tab-local filters |
| `Esc` | Picker overlay open | Any | Dismiss picker without changes |
| `Enter` | Picker overlay open | Any | Confirm selection, close picker |
| `j`/`k` | Picker overlay open | Any | Navigate picker list |
| `Space` | Label picker open | Issues | Toggle label selection |
| `/` | Picker overlay open | Any | Focus picker search input |
| `Esc` | Picker search input | Any | Return focus to picker list |

### Responsive Behavior

`useTerminalDimensions()` provides current terminal size. `useOnResize()` triggers synchronous re-layout.

| Dimension | 80×24 | 120×40 | 200×60+ |
|-----------|-------|--------|---------|
| Filter bar format | Condensed: primary value + "+N filters" | Full chips with `│` separators | Full chips with separators + padding |
| Picker overlay width | 90% terminal width | 60% terminal width | 50% terminal width |
| Picker overlay height | Max 60% terminal height | Max 60% terminal height | Max 60% terminal height |
| Picker item detail | Name only | Name + color dot (labels) | Name + color dot + description |
| Filter keybinding hints in status bar | Abbreviated: `f:filter x:clear` | Full: `f:filter o:state l:label r:repo x:clear` | Full (same as standard) |

### Data Hooks Consumed

| Hook | Source | Purpose |
|------|--------|---------|
| `useSearch()` | `@codeplane/ui-core` | Provides `searchIssues({ state })` with server-side state filter parameter |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size for breakpoint calculation and picker sizing |
| `useOnResize()` | `@opentui/react` | Synchronous re-layout on terminal resize |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler for filter keybindings |
| `useNavigation()` | TUI app shell | Unchanged; used for result navigation |

### API Endpoints Consumed

| Endpoint | Filter Parameters | Notes |
|----------|-------------------|-------|
| `GET /api/search/issues` | `state` (open/closed, server-side), `label`, `assignee`, `milestone` | State filter triggers re-query; label filter uses client-side until API label param is confirmed |
| `GET /api/search/repositories` | None currently | Visibility and language filters applied client-side |
| `GET /api/search/code` | None currently | Language and repo filters applied client-side |
| `GET /api/search/users` | None | No inline filters on Users tab |

### Client-Side Filtering Logic

Client-side filters apply a predicate chain to loaded results:

- **Visibility (repos)**: `item.is_private === false` for Public, `item.is_private === true` for Private
- **Language (repos)**: `item.language === selectedLanguage`
- **Language (code)**: Inferred from file extension in `item.path`; matched against selected language
- **Label (issues)**: `selectedLabels.every(label => item.labels.some(l => l.name === label))` (AND logic)
- **Repository (issues/code)**: `${item.repository_owner}/${item.repository_name} === selectedRepo`

Filtered results maintain their original order. The "showing M of N" indicator appears when client-side filters reduce the visible count below the total loaded count.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| See filter bar | ❌ | ✅ | ✅ |
| Use inline filters | ❌ | ✅ | ✅ |
| Filter by state (issues) | ❌ | ✅ | ✅ |
| Filter by visibility (repos) | ❌ | ✅ | ✅ |
| Filter by language | ❌ | ✅ | ✅ |
| Filter by repository scope | ❌ | ✅ | ✅ |
| Filter by label (issues) | ❌ | ✅ | ✅ |

- The search screen requires authentication. Unauthenticated sessions are redirected to the auth error screen before the search screen is reachable
- Inline filters do not expose additional data beyond what the search query already returns — they only narrow the visible subset
- Server-side filters (issue state) are enforced by the API; the TUI passes the parameter and renders whatever the server returns
- Client-side filters (visibility, language, label, repo scope) operate on data already authorized and returned by the API
- No elevated role is required to use any inline filter
- Private repository results only appear if the user has access; filtering by "Private" visibility does not reveal repos the user cannot see

### Token Handling

- Same token handling as the parent TUI_SEARCH_SCREEN — token from CLI keychain or `CODEPLANE_TOKEN`
- Filter-triggered re-queries use the same `Bearer` token on the `Authorization` header
- 401 on a filter-triggered re-query propagates to the app-shell auth error screen
- Filter values are not included in tokens, logs, or analytics in identifying form

### Rate Limiting

- Server-side filter changes (issue state cycling) dispatch one API request per change, debounced at 150ms
- Client-side filter changes dispatch zero API requests
- Rapid `o` pressing: debounced to prevent API flood; at most ~6 requests per minute (150ms debounce × 4 states)
- Picker overlay open/close does not dispatch API requests (picker items are extracted from already-loaded results)
- Server rate limit: 300 requests per minute per user across all API endpoints (shared with search queries)
- If a filter-triggered re-query returns 429: affected tab shows "Rate limited. Retry in {N}s." inline

### Input Sanitization

- Picker search input text is used only for client-side fuzzy matching — never sent to the API
- Filter values passed to the API (issue `state`) are constrained to a fixed enum ("open", "closed") — no arbitrary string injection
- All filter state is held in React component state — no URL, no localStorage, no disk persistence

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.search.filter_bar_toggled` | User presses `f` to show/hide filter bar | `tab`, `visible` (true/false), `active_filter_count`, `terminal_width`, `terminal_height` |
| `tui.search.filter_changed` | Any inline filter value changes | `tab`, `filter_dimension` ("state", "visibility", "language", "label", "repo"), `filter_type` ("server", "client"), `method` ("cycle", "picker"), `value_count` (number of active values for this dimension), `total_active_filters` |
| `tui.search.filter_state_cycled` | User presses `o` to cycle issue state | `tab` ("issues"), `from_state`, `to_state`, `query_length`, `visible_results_before`, `visible_results_after` |
| `tui.search.filter_visibility_cycled` | User presses `v` to cycle repo visibility | `tab` ("repositories"), `from_value`, `to_value`, `visible_results_before`, `visible_results_after` |
| `tui.search.filter_picker_opened` | User opens a picker overlay | `tab`, `picker_type` ("label", "language", "repo"), `available_items`, `terminal_width`, `terminal_height` |
| `tui.search.filter_picker_confirmed` | User confirms picker selection | `tab`, `picker_type`, `selected_count`, `picker_search_used` (boolean), `time_in_picker_ms` |
| `tui.search.filter_picker_dismissed` | User presses Esc on picker | `tab`, `picker_type`, `time_in_picker_ms` |
| `tui.search.filters_cleared` | User presses `x` to clear all filters | `tab`, `filters_cleared_count`, `filter_dimensions_cleared` (array of dimension names) |
| `tui.search.filter_empty_results` | Active filters reduce visible results to zero | `tab`, `active_filters` (object), `query_length`, `total_loaded_items` |
| `tui.search.filter_requery` | Server-side filter triggers API re-query | `tab`, `filter_dimension`, `new_value`, `duration_ms`, `result_count` |

### Common Event Properties

All filter events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `breakpoint`: Current responsive breakpoint ("minimum", "standard", "large")
- `query_length`: Length of the current search query

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Filter bar usage rate | ≥ 15% of search sessions | At least 15% of search sessions toggle the filter bar on |
| Filter engagement rate | ≥ 60% of filter bar opens | At least 60% of filter bar opens lead to at least one filter change |
| State filter usage | ≥ 50% of Issues tab sessions with filter bar | Most common filter dimension on Issues tab |
| Picker completion rate | ≥ 70% of picker opens | At least 70% of picker opens result in a confirmed selection (not Esc dismiss) |
| Filter-to-result rate | ≥ 30% of filter changes | At least 30% of filter changes lead to opening a result (indicates filters help users find what they need) |
| Zero-result filter rate | < 10% of filter changes | Fewer than 10% of filter changes produce zero visible results |
| Clear-all rate | < 30% of filter sessions | Fewer than 30% of filter sessions end with clearing all filters (indicates users don't get lost) |
| Mean filters per session | 1.5–3.0 | Average number of filter changes per filter session |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Filter bar toggled | `Search.Filter: bar toggled [tab={tab}] [visible={bool}]` |
| `debug` | Filter changed | `Search.Filter: changed [tab={tab}] [dimension={dim}] [type={server\|client}] [value={val}]` |
| `debug` | Picker opened | `Search.Filter: picker opened [tab={tab}] [type={type}] [items={n}]` |
| `debug` | Picker search | `Search.Filter: picker search [type={type}] [query_length={n}] [matches={n}]` |
| `debug` | Picker confirmed | `Search.Filter: picker confirmed [type={type}] [selected={n}]` |
| `debug` | Picker dismissed | `Search.Filter: picker dismissed [type={type}]` |
| `debug` | Filters cleared | `Search.Filter: cleared [tab={tab}] [count={n}]` |
| `debug` | Client-side filter applied | `Search.Filter: client filter [tab={tab}] [loaded={n}] [visible={n}]` |
| `info` | Server-side filter requery | `Search.Filter: requery [tab={tab}] [dimension={dim}] [value={val}] [results={n}] [duration={ms}ms]` |
| `info` | Filter produced zero results | `Search.Filter: zero results [tab={tab}] [filters={json}] [loaded={n}]` |
| `warn` | Filter requery failed | `Search.Filter: requery error [tab={tab}] [dimension={dim}] [status={code}] [error={msg}]` |
| `warn` | Rate limited on filter requery | `Search.Filter: rate limited [tab={tab}] [retry_after={n}s]` |
| `warn` | Picker has zero items | `Search.Filter: empty picker [tab={tab}] [type={type}]` |
| `error` | Filter render error | `Search.Filter: render error [tab={tab}] [component={name}] [error={msg}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases Specific to TUI

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Server-side filter requery fails (500) | API returns 5xx | "Filter failed. Press R to retry." inline on affected tab; previous results preserved |
| Server-side filter requery rate limited (429) | API returns 429 | "Rate limited. Retry in {N}s." on affected tab; filter value reverted to previous |
| Auth expired during filter requery (401) | API returns 401 | Propagated to app-shell auth error screen |
| Terminal resize while filter bar visible | `useOnResize` fires | Filter bar re-lays out at new breakpoint; filter state preserved |
| Terminal resize while picker overlay open | `useOnResize` fires | Picker re-centers and resizes; focus and selection preserved |
| Rapid `o`/`v` cycling | Debounce timer resets per keypress | Only final value dispatched to server after 150ms quiet period |
| Picker opened with stale data | Results loaded before filter bar was opened | Picker items are extracted from current loaded results; stale is acceptable |
| Client-side filter on partially loaded results | Pagination incomplete | Filter applies to loaded items; new pages are filtered on arrival |
| Navigation away while filter re-query in flight | User presses `q` or `Enter` | Pending request aborted; no stale results rendered on return |
| Component crash in filter bar | React error boundary | Caught by screen-level boundary; filter bar hidden; results list remains usable |
| Component crash in picker overlay | React error boundary | Caught by overlay boundary; picker dismissed; filter unchanged |

### Failure Modes and Recovery

- **Filter bar fails to render**: Falls back to no filter bar; all filter keybindings become no-ops; user can still use search and results normally
- **Picker overlay fails to render**: Error caught by overlay boundary; picker dismissed; focus returns to results list; user can retry by pressing the filter key again
- **Server-side filter re-query hangs**: 10s timeout; after timeout, error shown inline; user presses `R` to retry; filter value reverted
- **Client-side filter causes performance lag**: Filter predicates are simple equality/inclusion checks; no regex or complex computation; 300-item cap ensures filtering completes in <16ms
- **Memory pressure from filter state**: Filter state is lightweight (enum values, string arrays); no meaningful memory overhead beyond the result data itself

## Verification

### Test File: `e2e/tui/search.test.ts`

### Terminal Snapshot Tests

```
SNAP-FILTER-001: Filter bar renders on Issues tab at 120x40
  → Open search, type "api", wait for results, switch to Issues tab, press f
  → Assert filter bar appears between tab bar and results
  → Assert filter bar shows no chips (all defaults)
  → Assert "x:clear" right-aligned on filter bar

SNAP-FILTER-002: Filter bar with active state filter at 120x40
  → Issues tab, filter bar visible, press o
  → Assert filter bar shows "State: [Open]"
  → Assert results filtered to open issues only

SNAP-FILTER-003: Filter bar with multiple active filters at 120x40
  → Issues tab, press o (Open), then r (select a repo)
  → Assert filter bar shows "State: [Open] │ Repo: acme/api-gateway"
  → Assert results show only matching issues

SNAP-FILTER-004: Filter bar at 80x24 minimum — condensed format
  → Open search at 80x24, type "api", Issues tab, press f, press o
  → Assert filter bar shows "[Open]" only
  → Assert no │ separators at minimum size

SNAP-FILTER-005: Filter bar at 80x24 with multiple filters — condensed
  → Issues tab at 80x24, press o then l (select label)
  → Assert filter bar shows "[Open] +1 filter"

SNAP-FILTER-006: Filter bar on Repositories tab at 120x40
  → Repos tab, press f, press v
  → Assert "Visibility: [Public]" in filter bar

SNAP-FILTER-007: Filter bar on Code tab at 120x40
  → Code tab, press f, press l (select language)
  → Assert "Language: TypeScript" in filter bar

SNAP-FILTER-008: No filter bar on Users tab
  → Users tab, press f
  → Assert no filter bar appears
  → Assert results list unchanged

SNAP-FILTER-009: Label picker overlay at 120x40
  → Issues tab, filter bar visible, press l
  → Assert centered picker overlay with "Select Labels" title
  → Assert label list with [ ] checkboxes
  → Assert "Space:toggle  Enter:confirm  Esc:cancel" footer

SNAP-FILTER-010: Label picker with selection at 120x40
  → Open label picker, Space on "bug" label
  → Assert [✓] next to "bug"
  → Assert other labels show [ ]

SNAP-FILTER-011: Repository picker overlay at 120x40
  → Issues tab, filter bar visible, press r
  → Assert centered picker with "Select Repository" title
  → Assert "(All repositories)" option at top
  → Assert unique repos from loaded results listed

SNAP-FILTER-012: Language picker overlay at 120x40
  → Code tab, filter bar visible, press l
  → Assert centered picker with "Select Language" title
  → Assert languages extracted from loaded code results

SNAP-FILTER-013: Filter bar hidden after x:clear
  → Issues tab, state=Open, press x
  → Assert filter bar disappears (no chips to show)
  → Assert results return to unfiltered state

SNAP-FILTER-014: Zero results from filter — empty state
  → Issues tab, set state=Closed, apply label filter that matches nothing
  → Assert "No results match the current filters." centered
  → Assert "Press `x` to clear filters." hint below

SNAP-FILTER-015: "(showing M of N)" indicator with active client-side filter
  → Issues tab with 12 results, apply label filter reducing to 3
  → Assert "(showing 3 of 12)" in results area

SNAP-FILTER-016: Picker overlay at 80x24 minimum
  → At 80x24, Issues tab, press l
  → Assert picker uses 90% terminal width
  → Assert picker items show name only (no descriptions)

SNAP-FILTER-017: Picker overlay at 200x60 large
  → At 200x60, Issues tab, press l
  → Assert picker uses 50% terminal width
  → Assert picker items show name + description

SNAP-FILTER-018: Filter bar responsive transition 120→80
  → Active filter bar at 120x40 with "State: [Open] │ Label: bug"
  → Resize to 80x24
  → Assert condensed format "[Open] +1 filter"

SNAP-FILTER-019: Status bar keybinding hints with filter bar visible
  → Issues tab, filter bar visible at 120x40
  → Assert status bar includes "f:filter  o:state  l:label  r:repo  x:clear"

SNAP-FILTER-020: Status bar keybinding hints at 80x24 with filter bar
  → Issues tab, filter bar visible at 80x24
  → Assert status bar shows abbreviated "f:filter x:clear"
```

### Keyboard Interaction Tests

```
KEY-FILTER-001: f toggles filter bar on Issues tab
  → Issues tab, press f → Assert filter bar visible
  → Press f again → Assert filter bar hidden

KEY-FILTER-002: f is no-op on Users tab
  → Users tab, press f → Assert no filter bar → Assert no UI change

KEY-FILTER-003: o cycles issue state filter
  → Issues tab, filter bar visible, press o → Assert state "Open"
  → Press o → Assert state "Closed"
  → Press o → Assert state "All" (filter chip hidden)

KEY-FILTER-004: v cycles repository visibility filter
  → Repos tab, filter bar visible, press v → Assert "Public"
  → Press v → Assert "Private"
  → Press v → Assert "All" (chip hidden)

KEY-FILTER-005: l opens label picker on Issues tab
  → Issues tab, filter bar visible, press l
  → Assert label picker overlay opens
  → Assert focus trapped in picker

KEY-FILTER-006: l opens language picker on Repos tab
  → Repos tab, filter bar visible, press l
  → Assert language picker overlay opens

KEY-FILTER-007: l opens language picker on Code tab
  → Code tab, filter bar visible, press l
  → Assert language picker overlay opens

KEY-FILTER-008: r opens repo picker on Issues tab
  → Issues tab, filter bar visible, press r
  → Assert repository picker overlay opens

KEY-FILTER-009: r opens repo picker on Code tab
  → Code tab, filter bar visible, press r
  → Assert repository picker overlay opens

KEY-FILTER-010: r is no-op on Repos tab
  → Repos tab, filter bar visible, press r → Assert no picker opens

KEY-FILTER-011: x clears all filters
  → Issues tab, state=Open, label=bug, press x
  → Assert state reset to All, labels cleared
  → Assert filter bar hidden (no active filters)
  → Assert results return to unfiltered state

KEY-FILTER-012: Esc dismisses picker without changes
  → Open label picker, navigate to "enhancement", Esc
  → Assert picker closed
  → Assert no label filter applied
  → Assert focus returns to results list

KEY-FILTER-013: Enter confirms picker selection
  → Open label picker, Space on "bug", Enter
  → Assert picker closed
  → Assert "Label: bug" appears in filter bar
  → Assert results filtered to issues with "bug" label

KEY-FILTER-014: Space toggles label selection in multi-select picker
  → Open label picker, Space on "bug" → Assert [✓]
  → Space on "enhancement" → Assert both [✓]
  → Space on "bug" again → Assert "bug" [  ], "enhancement" [✓]

KEY-FILTER-015: j/k navigates picker list
  → Open label picker → Assert first item focused
  → Press j → Assert second item focused
  → Press k → Assert first item focused again

KEY-FILTER-016: / focuses picker search input
  → Open repo picker, press /
  → Assert picker search input focused
  → Type "acme" → Assert list filtered to repos containing "acme"

KEY-FILTER-017: Esc in picker search input returns to picker list
  → Picker open, / to focus search, type "acme", Esc
  → Assert focus returns to picker list
  → Assert search cleared

KEY-FILTER-018: Filter keybindings suppressed when search input focused
  → Focus search input (🔍), press f → Assert "f" typed in input
  → Press o → Assert "fo" typed in input
  → Assert no filter bar toggled

KEY-FILTER-019: Filter keybindings suppressed when filter bar hidden
  → Filter bar hidden, press o → Assert no state change
  → Press l → Assert no picker opens
  → Press f → Assert filter bar now visible

KEY-FILTER-020: Tab switch dismisses picker
  → Issues tab, open label picker, press Tab
  → Assert picker dismissed
  → Assert switched to next tab

KEY-FILTER-021: State filter re-queries server
  → Issues tab, filter bar visible, press o (→ Open)
  → Assert API request to /api/search/issues?q={query}&state=open dispatched
  → Assert results update with server response

KEY-FILTER-022: Client-side filter does not re-query server
  → Repos tab, filter bar visible, press v (→ Public)
  → Assert no new API request dispatched
  → Assert results filtered client-side immediately

KEY-FILTER-023: Focus returns to results list after picker confirm
  → Open repo picker, select a repo, Enter
  → Assert picker closed
  → Assert results list focused
  → Assert j/k navigation works on results

KEY-FILTER-024: Rapid o presses debounced
  → Issues tab, rapidly press o o o o (4 times in <150ms)
  → Assert at most 1 API request dispatched (for final state value)

KEY-FILTER-025: Filter preserved across tab switch
  → Issues tab, state=Open, Tab to Users, Tab back to Issues
  → Assert state filter still "Open"
  → Assert filter bar still visible with "State: [Open]"

KEY-FILTER-026: g g and G work with filtered results
  → Issues tab, apply client-side filter reducing to 5 results
  → Press G → Assert last of 5 filtered results focused
  → Press g g → Assert first of 5 filtered results focused

KEY-FILTER-027: Enter on filtered result navigates correctly
  → Issues tab, apply label filter, Enter on filtered result
  → Assert issue detail screen pushed
  → Press q → Assert return to search with filters preserved

KEY-FILTER-028: Pagination with active client-side filter
  → Issues tab, apply label filter, scroll to bottom
  → Assert pagination loads next page
  → Assert new page items are filtered through active label filter
```

### Responsive Tests

```
RESIZE-FILTER-001: 120x40 full filter bar layout
  → Issues tab, state=Open, label=bug at 120x40
  → Assert "State: [Open] │ Label: bug" with │ separator

RESIZE-FILTER-002: 80x24 condensed filter bar layout
  → Issues tab, state=Open, label=bug at 80x24
  → Assert "[Open] +1 filter" condensed format

RESIZE-FILTER-003: 200x60 full filter bar with padding
  → Issues tab, state=Open, label=bug at 200x60
  → Assert full chips with additional spacing

RESIZE-FILTER-004: Resize 120→80 collapses filter bar
  → Active filter bar at 120x40 → Resize to 80x24
  → Assert filter bar transitions to condensed format
  → Assert filter values preserved

RESIZE-FILTER-005: Resize 80→120 expands filter bar
  → Active filter bar at 80x24 → Resize to 120x40
  → Assert filter bar transitions to full chip format
  → Assert filter values preserved

RESIZE-FILTER-006: Resize preserves filter state
  → Issues tab, state=Closed, label=enhancement, resize 120→80→200→120
  → Assert filter values unchanged at every breakpoint

RESIZE-FILTER-007: Resize while picker open re-centers
  → Open label picker at 120x40 → Resize to 80x24
  → Assert picker resizes to 90% width and re-centers

RESIZE-FILTER-008: Resize while picker open preserves selection
  → Open label picker, toggle "bug", resize 120→80
  → Assert "bug" still toggled [✓]
  → Assert picker list still navigable

RESIZE-FILTER-009: Picker width adapts to breakpoint
  → Open repo picker at 80x24 → Assert 90% width
  → Close, resize to 120x40, reopen → Assert 60% width
  → Close, resize to 200x60, reopen → Assert 50% width

RESIZE-FILTER-010: Filter bar hidden correctly after resize
  → Filter bar hidden at 120x40 → Resize to 80x24
  → Assert filter bar still hidden
  → Press f → Assert filter bar appears in condensed format
```

### Integration Tests

```
INT-FILTER-001: Full filter flow — toggle, filter, browse, open, return
  → g s → type "api" → wait → Tab to Issues → f → o (Open) → l (select "bug") → Enter
  → Assert filtered results → Enter on result → verify issue detail → q → verify filters preserved

INT-FILTER-002: State filter triggers server re-query
  → Issues tab, f, o → Assert GET /api/search/issues?q=api&state=open dispatched
  → Assert results replaced with server response
  → Assert pagination reset to page 1

INT-FILTER-003: Client-side label filter reduces results
  → Issues tab with 12 loaded results, f, l, select "bug", Enter
  → Assert only issues with "bug" label visible
  → Assert "(showing M of 12)" indicator

INT-FILTER-004: Client-side visibility filter on repos
  → Repos tab with public and private repos, f, v (Public)
  → Assert only public repos visible
  → Assert no API request (client-side)

INT-FILTER-005: Repo scope filter narrows results
  → Issues tab, f, r, select "acme/api-gateway", Enter
  → Assert only issues from acme/api-gateway visible

INT-FILTER-006: Clear all filters restores full results
  → Issues tab, state=Open, label=bug, repo=acme/*, press x
  → Assert all filters cleared
  → Assert full unfiltered results restored
  → Assert filter bar hidden

INT-FILTER-007: Filter state preserved across tab switches
  → Issues tab, state=Open → Tab to Code → Tab back to Issues
  → Assert state=Open, filter bar visible

INT-FILTER-008: Filter state reset on screen pop
  → Issues tab, state=Closed → q (pop search) → g s (reopen)
  → Assert filters reset to defaults

INT-FILTER-009: Query change with active filter
  → Issues tab, state=Open, edit search query → wait debounce
  → Assert new results fetched with state=open parameter
  → Assert filter bar and state preserved

INT-FILTER-010: Pagination with client-side filter
  → Issues tab, label filter active, scroll to 80% → Assert page 2 loads
  → Assert new items filtered through label predicate

INT-FILTER-011: Filter requery 429 handling
  → Issues tab, o cycles state → API returns 429
  → Assert "Rate limited. Retry in {N}s." on Issues tab

INT-FILTER-012: Filter requery 500 handling
  → Issues tab, o cycles state → API returns 500
  → Assert "Filter failed. Press R to retry." on Issues tab
  → Assert previous results preserved

INT-FILTER-013: Filter requery 401 handling
  → Issues tab, o cycles state → API returns 401
  → Assert app-shell auth error screen shown

INT-FILTER-014: Picker with zero items
  → Issues tab with no labels in results, press l
  → Assert picker shows "No labels found in results"
  → Assert Enter is no-op; only Esc dismisses

INT-FILTER-015: Picker fuzzy search
  → Issues tab, l, type "enh" in picker search
  → Assert "enhancement" label visible, others hidden
  → Assert fuzzy match highlighting
```
