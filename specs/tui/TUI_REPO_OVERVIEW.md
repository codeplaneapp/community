# TUI_REPO_OVERVIEW

Specification for TUI_REPO_OVERVIEW.

## High-Level User POV

The repository overview is the anchor screen for every repository interaction in the Codeplane TUI. When a user presses `Enter` on a repository row in the dashboard repos list, the repository list screen, or navigates via deep link (`codeplane tui --screen repos --repo owner/repo`), they land on this screen. It answers the question: "What is this repository, what is its current state, and where do I go from here?"

The screen is divided into clearly labeled sections, all rendered in a single vertical scrollbox. At the top is a prominent header showing the repository's full name (`owner/name`), a visibility badge (`PUBLIC` in green or `PRIVATE` in yellow), and — if the repository is archived — an `ARCHIVED` badge in red. Below the header is a metadata section laid out as key-value pairs: owner, default bookmark, clone URL, creation date, and last updated date. The clone URL line includes a hint (`c` to copy) so the user knows they can grab it without leaving the screen.

Below the metadata is a stats row showing four engagement counters rendered inline: stars (`★`), forks (`⑂`), watchers (`👁`), and open issues. Each counter is displayed with its icon and count. If the user has starred the repository, the star icon is rendered in the `primary` accent color; otherwise, it is `muted`.

If the repository has topics, they appear as a row of inline tags — each topic wrapped in square brackets and rendered in the `primary` color. If the repository is a fork, a fork indicator line appears: "Forked from {parent_full_name}" in muted text, and pressing `Enter` on it navigates to the parent repository.

If the repository has a description, it is rendered below the topics as a block of wrapped text. Descriptions can be multiple lines and respect the available terminal width.

Finally, if a README exists, it is rendered using the `<markdown>` component — including headings, lists, code blocks with syntax highlighting, bold, italic, and blockquotes. If no README is present, a muted message reads "No README found."

The screen is keyboard-driven. The user can star or unstar the repository with `s`, copy the clone URL to the clipboard with `c`, and jump directly into any of the repository's sub-screens: `b` for bookmarks, `i` for issues, `l` for landing requests, `f` for workflows, `k` for wiki, `e` for code explorer, and `Tab`/`Shift+Tab` or number keys to switch between repository tabs. Pressing `q` or `Esc` pops back to the previous screen. The scrollbox responds to `j`/`k` for line-by-line scrolling, `Ctrl+D`/`Ctrl+U` for page scrolling, and `G`/`g g` for jumping to the bottom or top.

At minimum terminal size (80×24), the layout compresses: topic tags wrap to the next line, the stats row stacks vertically if it exceeds the terminal width, and the README section is limited to the available height minus the metadata. At standard size (120×40), everything fits comfortably in a single-column layout. At large sizes (200×60+), the metadata section uses wider key-value spacing, and the README renders with more comfortable margins.

If the API request fails — due to a network error, missing repository (404), or rate limiting — the content area shows an error message in red with a hint: "Press `R` to retry." The header bar and status bar remain stable throughout.

## Acceptance Criteria

### Definition of Done

- The repository overview screen renders when pushed via `push("repo-overview", { repo: "owner/name" })` from any source (dashboard, repo list, go-to, deep link, command palette)
- Repository data is fetched via `useRepo(owner, repo)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo`
- The screen displays all fields from the `RepoResponse` payload in their designated sections
- The header shows `full_name`, visibility badge (`PUBLIC` or `PRIVATE`), and archive badge (`ARCHIVED`) when applicable
- The metadata section shows: owner, default bookmark, clone URL (with copy hint), created_at (relative), updated_at (relative)
- The stats row shows: num_stars, num_forks, num_watches, num_issues with their respective icons
- Topics are rendered as inline `[topic]` tags when `topics.length > 0`
- Fork indicator shows "Forked from {parent}" when `is_fork` is true, with navigation to the parent repo on `Enter`
- Description is rendered as wrapped plain text when non-empty
- README is fetched and rendered via the `<markdown>` component when available; "No README found." shown otherwise
- The star icon reflects the current user's star status (highlighted when starred)
- `s` toggles star/unstar with optimistic UI (immediate visual update, revert on error)
- `c` copies the clone URL to the system clipboard and shows a transient confirmation in the status bar: "Copied!" for 2 seconds
- `b`, `i`, `l`, `f`, `k`, `e` push their respective sub-screens onto the navigation stack
- `q`/`Esc` pops the screen and returns to the previous screen with scroll position preserved
- Scrollbox supports `j`/`k`, `Ctrl+D`/`Ctrl+U`, `G`/`g g` for navigation within the content
- The header bar breadcrumb updates to show "… > owner/repo" when this screen is active
- Loading state shows a centered spinner with "Loading…" in the content area while the initial fetch is in progress
- Error states (404, 500, network) show inline error message with "Press `R` to retry"
- 401 errors propagate to the app-shell auth error screen

### Keyboard Interactions

- `j` / `Down`: Scroll content down by one line
- `k` / `Up`: Scroll content up by one line
- `Ctrl+D`: Page down (half visible height)
- `Ctrl+U`: Page up (half visible height)
- `G`: Scroll to bottom of content
- `g g`: Scroll to top of content
- `s`: Star / unstar the repository (toggle)
- `c`: Copy clone URL to clipboard
- `b`: Navigate to bookmarks view
- `i`: Navigate to issues list
- `l`: Navigate to landing requests list
- `f`: Navigate to workflows list
- `k`: Navigate to wiki
- `e`: Navigate to code explorer
- `Tab` / `Shift+Tab`: Cycle through repository tabs
- `1`–`9`: Jump to repository tab by number
- `R`: Retry failed fetch (only active in error state)
- `q`: Pop screen (return to previous)
- `Esc`: Pop screen (return to previous)
- `?`: Show help overlay with all keybindings for this screen

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router
- 80×24 – 119×39 (minimum): Single-column layout. Metadata key-value pairs use 12-char label width. Topics wrap across multiple lines. Stats rendered as stacked lines if they exceed terminal width. README section uses remaining height. Clone URL truncated with `…` if exceeds width
- 120×40 – 199×59 (standard): Full single-column layout. Metadata labels use 18-char width. All stats on one line. Topics on one line unless they overflow. README section with comfortable padding
- 200×60+ (large): Metadata section uses 24-char labels with extra spacing. Stats on one line with extra spacing. Topics render with breathing room. README renders with margin

### Truncation and Boundary Constraints

- `full_name`: never truncated (always fits in header at minimum 80 cols)
- `description`: wrapped at terminal width minus 4 chars padding. No truncation — full text rendered
- Clone URL: truncated with trailing `…` at minimum size if exceeding `terminal_width - 16`
- Topic tags: each tag max 30 characters, truncated with `…`. Total topics row wraps to additional lines
- Relative timestamps: never exceed 4 characters (e.g., "3d", "1mo", "2y")
- Star/fork/watch/issue counts: K-abbreviated above 999 (e.g., "1.2k"), M-abbreviated above 999,999. Never exceeds 7 characters
- README content: rendered in full within the scrollbox (no truncation, scrollable)
- Maximum scrollbox content height: 10,000 lines (pagination cap for README rendering)
- Fork parent name: truncated with `…` if exceeding 50 characters

### Edge Cases

- Terminal resize while scrolled: scroll position preserved relative to content; layout recalculates synchronously
- Rapid key presses: processed sequentially, no debouncing. Multiple `j` presses scroll smoothly
- Star toggle during in-flight star request: second press queued until first completes (prevents double-star)
- Copy to clipboard on systems without clipboard access: status bar shows "Copy not available" instead of "Copied!"
- Repository deleted between navigation and load: 404 error screen with "Repository not found. Press `q` to go back."
- Repository with empty description, no topics, no README: only header, metadata, and stats sections rendered. No blank sections
- Repository with extremely long description (>5000 chars): rendered in full within scrollbox, no truncation
- Repository with 50+ topics: topics wrap across multiple lines within the scrollbox
- Fork indicator for a parent repository that has been deleted: "Forked from [deleted repository]" in muted text, `Enter` is a no-op
- Unicode characters in description, topics, or README: rendered correctly, truncation respects grapheme clusters
- SSE disconnect: repository overview is unaffected (uses REST, not SSE)

## Design

### Layout Structure

The repository overview screen occupies the full content area between the header bar and status bar:

```
<scrollbox flexGrow={1}>
  <box flexDirection="column" gap={1} paddingX={1}>

    {/* Repository header */}
    <box flexDirection="row" gap={1} height={1}>
      <text bold>{repo.full_name}</text>
      <text color={repo.is_public ? "success" : "warning"} bold>
        {repo.is_public ? "PUBLIC" : "PRIVATE"}
      </text>
      {repo.is_archived && (
        <text color="error" bold>ARCHIVED</text>
      )}
    </box>

    {/* Metadata section */}
    <box flexDirection="column">
      <box flexDirection="row" height={1}>
        <box width={labelWidth}><text color="muted">Owner</text></box>
        <text>{repo.owner}</text>
      </box>
      <box flexDirection="row" height={1}>
        <box width={labelWidth}><text color="muted">Default bookmark</text></box>
        <text color="primary">{repo.default_bookmark}</text>
      </box>
      <box flexDirection="row" height={1}>
        <box width={labelWidth}><text color="muted">Clone URL</text></box>
        <text>{truncate(repo.clone_url, cloneUrlWidth)}</text>
        <text color="muted"> (c to copy)</text>
      </box>
      <box flexDirection="row" height={1}>
        <box width={labelWidth}><text color="muted">Created</text></box>
        <text color="muted">{relativeTime(repo.created_at)}</text>
      </box>
      <box flexDirection="row" height={1}>
        <box width={labelWidth}><text color="muted">Updated</text></box>
        <text color="muted">{relativeTime(repo.updated_at)}</text>
      </box>
    </box>

    {/* Stats row */}
    <box flexDirection="row" gap={2} height={1}>
      <text color={isStarred ? "primary" : "muted"}>★ {formatCount(repo.num_stars)}</text>
      <text color="muted">⑂ {formatCount(repo.num_forks)}</text>
      <text color="muted">👁 {formatCount(repo.num_watches)}</text>
      <text color="muted">Issues: {formatCount(repo.num_issues)}</text>
    </box>

    {/* Topics */}
    {repo.topics.length > 0 && (
      <box flexDirection="row" flexWrap="wrap" gap={1}>
        {repo.topics.map(topic => (
          <text key={topic} color="primary">[{truncate(topic, 30)}]</text>
        ))}
      </box>
    )}

    {/* Fork indicator */}
    {repo.is_fork && (
      <box height={1}>
        <text color="muted">Forked from </text>
        <text color="primary">{parentRepo?.full_name ?? "[deleted repository]"}</text>
      </box>
    )}

    {/* Description */}
    {repo.description !== "" && (
      <box>
        <text wrap="wrap">{repo.description}</text>
      </box>
    )}

    {/* README */}
    {readme ? (
      <box>
        <markdown>{readme}</markdown>
      </box>
    ) : (
      <box>
        <text color="muted">No README found.</text>
      </box>
    )}

  </box>
</scrollbox>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Scroll content down | Scrollbox focused |
| `k` / `Up` | Scroll content up | Scrollbox focused |
| `Ctrl+D` | Page down | Scrollbox focused |
| `Ctrl+U` | Page up | Scrollbox focused |
| `G` | Scroll to bottom | Scrollbox focused |
| `g g` | Scroll to top | Scrollbox focused |
| `s` | Star / unstar repository | Not in error state |
| `c` | Copy clone URL to clipboard | Not in error state |
| `b` | Navigate to bookmarks | Not in error state |
| `i` | Navigate to issues | Not in error state |
| `l` | Navigate to landing requests | Not in error state |
| `f` | Navigate to workflows | Not in error state |
| `k` | Navigate to wiki | From overview section (not during scroll) |
| `e` | Navigate to code explorer | Not in error state |
| `Tab` | Next repository tab | Always |
| `Shift+Tab` | Previous repository tab | Always |
| `1`–`9` | Jump to tab by number | Always |
| `R` | Retry failed fetch | Error state displayed |
| `q` | Pop screen (go back) | Always |
| `Esc` | Pop screen (go back) | No overlay open |
| `?` | Show help overlay | Always |

### Responsive Column Layout

**80×24 (minimum):** Label width 12 chars. Stats stacked vertically when width < 120. Clone URL truncated. Topics wrap across lines.

**120×40 (standard):** Label width 18 chars. Stats on one line. Full clone URL. Topics on one line unless overflow.

**200×60 (large):** Label width 24 chars. Extra vertical spacing between sections. Wider margins for README content.

### Data Hooks

- `useRepo(owner, repo)` from `@codeplane/ui-core` — returns `{ data: RepoResponse | null, isLoading: boolean, error: Error | null, retry: () => void }`. Calls `GET /api/repos/:owner/:repo`
- `useRepoReadme(owner, repo)` from `@codeplane/ui-core` — returns `{ content: string | null, isLoading: boolean, error: Error | null }`. Calls `GET /api/repos/:owner/:repo/readme`. Returns null if no README exists
- `useStarRepo(owner, repo)` from `@codeplane/ui-core` — returns `{ isStarred: boolean, toggle: () => Promise<void> }`. Calls `PUT /api/repos/:owner/:repo/star` or `DELETE /api/repos/:owner/:repo/star`
- `useClipboard()` — platform-aware clipboard write. Returns `{ copy: (text: string) => Promise<boolean>, supported: boolean }`
- `useTerminalDimensions()` — for responsive layout breakpoints
- `useOnResize()` — trigger synchronous re-layout
- `useKeyboard()` — keybinding registration
- `useNavigation()` — for `push()`, `pop()`, and context access

### Navigation Context

This screen receives `{ repo: "owner/name" }` as context from the navigation stack. The `owner` and `repo` are parsed from the `full_name` string.

When sub-screen keybindings are pressed:
- `b` → `push("repo-bookmarks", { repo })`
- `i` → `push("issue-list", { repo })`
- `l` → `push("landing-list", { repo })`
- `f` → `push("workflow-list", { repo })`
- `k` → `push("wiki-list", { repo })`
- `e` → `push("code-explorer", { repo })`

When the fork indicator is activated:
- `Enter` on fork line → `push("repo-overview", { repo: parentRepo.full_name })`

Breadcrumb updates to `… > owner/repo` when this screen is active.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (no access) | Read-Only | Member | Admin | Owner |
|--------|-----------|---------------------------|-----------|--------|-------|-------|
| View public repo overview | ❌ (TUI requires auth) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View private repo overview | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| Star / unstar | ❌ | ✅ (any authenticated user) | ✅ | ✅ | ✅ | ✅ |
| Copy clone URL | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Navigate to settings tab | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- Private repositories return 404 to users without read access (does not leak existence)
- The star action requires any authenticated user — you do not need collaborator access to star a public repository
- The settings tab keybinding (`9` or `Tab` cycling) is hidden from the keybinding hints if the user lacks admin/owner role

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen

### Rate Limiting

- Authenticated users: 5,000 requests per hour to `GET /api/repos/:owner/:repo` (platform-wide rate limit)
- Star toggle: 30 requests per minute (per user, per repo)
- If 429 is returned, the affected section displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period

### Input Sanitization

- Repository `owner` and `name` are parsed from the navigation context string and validated against `^[a-zA-Z0-9_.-]+$`
- No user-generated text input on this screen (read-only display)
- Repository descriptions, topics, and README content rendered as plain text via `<text>` and `<markdown>` components (no injection risk)
- Clone URL copied to clipboard exactly as received from the API — no user modification possible

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.overview.view` | Repository overview loads successfully | `repo_full_name`, `repo_id`, `is_public`, `is_archived`, `is_fork`, `has_description`, `has_readme`, `topics_count`, `num_stars`, `num_forks`, `num_issues`, `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms`, `navigation_source` (dashboard/repo_list/goto/deep_link/command_palette) |
| `tui.repo.overview.star` | User presses `s` to star | `repo_full_name`, `action` (star/unstar), `new_count`, `optimistic` |
| `tui.repo.overview.copy_clone_url` | User presses `c` to copy clone URL | `repo_full_name`, `clone_url_protocol` (ssh), `copy_success` |
| `tui.repo.overview.navigate` | User navigates to a sub-screen | `repo_full_name`, `destination` (bookmarks/issues/landings/workflows/wiki/code_explorer), `key_used` |
| `tui.repo.overview.tab_switch` | User switches repository tab | `repo_full_name`, `from_tab`, `to_tab`, `method` (tab_key/number_key) |
| `tui.repo.overview.scroll` | User scrolls within the overview | `repo_full_name`, `scroll_depth_percent`, `method` (j_k/ctrl_d_u/G_gg) |
| `tui.repo.overview.readme_rendered` | README markdown finishes rendering | `repo_full_name`, `readme_length_chars`, `render_time_ms` |
| `tui.repo.overview.error` | API request fails | `repo_full_name`, `error_type` (network/not_found/auth/rate_limit/server), `http_status` |
| `tui.repo.overview.retry` | User presses `R` to retry | `repo_full_name`, `error_type`, `retry_success` |
| `tui.repo.overview.fork_navigate` | User presses Enter on fork indicator | `repo_full_name`, `parent_repo_full_name` |

### Success Indicators

- **Repo overview load completion rate**: percentage of navigation-to-repo-overview events that result in a successful view (target: >98%)
- **Sub-screen navigation rate**: percentage of repo overview views where the user navigates to at least one sub-screen (target: >50%)
- **Star conversion rate**: percentage of repo overview views where the user stars the repo (target: track trend)
- **Clone URL copy rate**: percentage of repo overview views where the user copies the clone URL (target: >10%)
- **README engagement**: percentage of views where the user scrolls past the README fold (target: >30%)
- **Error rate**: percentage of repo overview loads that fail (target: <2%)
- **Retry success rate**: percentage of retry attempts that succeed (target: >80%)
- **Time to first interaction**: median time from overview load to first keypress (target: <3s)
- **Navigation source distribution**: breakdown by dashboard, repo list, go-to, deep link, command palette (monitor adoption of each path)

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|--------|
| `info` | Repo overview loaded | `repo_full_name`, `load_time_ms`, `has_readme`, `topics_count` |
| `info` | Star toggled | `repo_full_name`, `action` (star/unstar), `success` |
| `info` | Clone URL copied | `repo_full_name`, `copy_success` |
| `info` | Sub-screen navigated | `repo_full_name`, `destination`, `key_used` |
| `warn` | API error on repo fetch | `repo_full_name`, `http_status`, `error_message` (no token) |
| `warn` | Rate limited on repo fetch | `repo_full_name`, `retry_after_seconds` |
| `warn` | Star toggle failed | `repo_full_name`, `action`, `http_status`, `error_message` |
| `warn` | Clipboard copy failed | `repo_full_name`, `reason` (not_supported/permission_denied) |
| `warn` | README fetch failed | `repo_full_name`, `http_status` |
| `debug` | Scroll position updated | `scroll_percent`, `content_height`, `viewport_height` |
| `debug` | Resize triggered | `old_dimensions`, `new_dimensions`, `breakpoint_change` |
| `debug` | Fork parent resolved | `repo_full_name`, `parent_full_name`, `parent_exists` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on repo fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press R to retry" |
| Repository not found (404) | API returns 404 | Error message: "Repository not found." + "Press `q` to go back." |
| Private repo, no access (404) | API returns 404 | Same as above — indistinguishable by design |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline error: "Rate limited. Retry in Ns." R retries after waiting |
| Server error (500) | API returns 5xx | Inline error with generic message + R to retry |
| README fetch failure | README hook returns error | README section shows "Unable to load README." in muted text. Rest of screen renders normally |
| Star toggle failure | Star hook returns error | Star count reverts to pre-toggle value. Status bar shows "Star failed" for 2 seconds |
| Clipboard not available | `useClipboard().supported` is false | Status bar shows "Copy not available" for 2 seconds |
| Terminal resize during repo load | `useOnResize` fires during fetch | Fetch continues. Renders at new size when data arrives |
| Terminal resize while scrolled | `useOnResize` fires | Layout recalculates. Scroll position preserved relative to content |
| Fork parent deleted | Parent repo returns 404 | Fork indicator shows "[deleted repository]", Enter is no-op |
| Malformed API response | JSON parse error | Error state rendered with generic error message + R to retry |
| React error boundary triggered | Error boundary catches | Error screen per app-shell error boundary |
| SSE disconnect | Status bar shows disconnected | Repo overview unaffected (uses REST, not SSE) |

### Failure Modes

- **Total fetch failure**: Error state shown in content area. Header bar and status bar remain stable. `q` still navigates back
- **Partial failure (README fails but repo loads)**: Repo metadata, stats, topics, and description render normally. README section shows error message. No cascade
- **Star toggle network failure**: Optimistic UI reverts. Star count returns to original. Status bar shows transient error
- **Memory pressure from large README**: 10,000-line rendering cap prevents unbounded memory growth. Scrollbox virtualizes offscreen content

## Verification

### Test File: `e2e/tui/repository.test.ts`

### Terminal Snapshot Tests

- **repo-overview-initial-load**: Navigate to a public repo → snapshot matches golden file showing full_name header, PUBLIC badge, metadata section, stats row, topics, description, and README
- **repo-overview-private-repo**: Navigate to a private repo → snapshot shows PRIVATE badge in yellow
- **repo-overview-archived-repo**: Navigate to an archived repo → snapshot shows ARCHIVED badge in red alongside visibility badge
- **repo-overview-no-description**: Navigate to repo with empty description → no blank description section rendered
- **repo-overview-no-topics**: Navigate to repo with no topics → no topics row rendered
- **repo-overview-no-readme**: Navigate to repo with no README → "No README found." shown in muted text
- **repo-overview-with-readme**: Navigate to repo with README → markdown rendered with headings, code blocks, and lists
- **repo-overview-fork-indicator**: Navigate to a forked repo → "Forked from parent/repo" line visible
- **repo-overview-fork-deleted-parent**: Navigate to a fork with deleted parent → "Forked from [deleted repository]" in muted text
- **repo-overview-star-highlighted**: Navigate to a repo the user has starred → star icon rendered in primary color
- **repo-overview-star-not-highlighted**: Navigate to a repo the user has not starred → star icon rendered in muted color
- **repo-overview-stats-row**: Navigate to repo with stars=42, forks=5, watches=12, issues=7 → stats row shows "★ 42  ⑂ 5  👁 12  Issues: 7"
- **repo-overview-stats-abbreviated**: Navigate to repo with num_stars=1234 → star count shows "★ 1.2k"
- **repo-overview-loading-state**: Navigate to repo with slow API → spinner with "Loading…" centered in content area, header and status bar stable
- **repo-overview-error-state**: Navigate to repo with failing API → error message in red with "Press R to retry"
- **repo-overview-404-state**: Navigate to nonexistent repo → "Repository not found." with "Press `q` to go back."
- **repo-overview-many-topics**: Navigate to repo with 15 topics → topics wrap across multiple lines
- **repo-overview-long-description**: Navigate to repo with 500-char description → text wraps within terminal width
- **repo-overview-clone-url-display**: Clone URL displayed with "(c to copy)" hint
- **repo-overview-breadcrumb**: After navigation → header breadcrumb shows "… > owner/repo"
- **repo-overview-copied-confirmation**: Press `c` → status bar shows "Copied!" for 2 seconds

### Keyboard Interaction Tests

- **repo-overview-j-scrolls-down**: Press `j` → scrollbox scrolls down by one line
- **repo-overview-k-scrolls-up**: Scroll down, press `k` → scrollbox scrolls up by one line
- **repo-overview-k-at-top-no-op**: At top of content, press `k` → no scroll (stays at top)
- **repo-overview-ctrl-d-page-down**: Press `Ctrl+D` → scrollbox scrolls down by half visible height
- **repo-overview-ctrl-u-page-up**: Press `Ctrl+D` then `Ctrl+U` → scrollbox returns to original position
- **repo-overview-G-scrolls-to-bottom**: Press `G` → scrollbox at bottom of content
- **repo-overview-gg-scrolls-to-top**: Press `G` then `g g` → scrollbox at top of content
- **repo-overview-s-stars-repo**: Press `s` on unstarred repo → star count increments, star icon changes to primary color
- **repo-overview-s-unstars-repo**: Press `s` on starred repo → star count decrements, star icon changes to muted color
- **repo-overview-s-optimistic-revert**: Press `s` with failing API → star count reverts after error
- **repo-overview-c-copies-clone-url**: Press `c` → clipboard contains clone URL, status bar shows "Copied!"
- **repo-overview-c-clipboard-unavailable**: Press `c` on system without clipboard → status bar shows "Copy not available"
- **repo-overview-b-navigates-bookmarks**: Press `b` → bookmarks screen pushed, breadcrumb updated
- **repo-overview-i-navigates-issues**: Press `i` → issues list pushed, breadcrumb updated
- **repo-overview-l-navigates-landings**: Press `l` → landing requests list pushed, breadcrumb updated
- **repo-overview-f-navigates-workflows**: Press `f` → workflows list pushed, breadcrumb updated
- **repo-overview-e-navigates-code-explorer**: Press `e` → code explorer pushed, breadcrumb updated
- **repo-overview-tab-cycles-tabs**: Press `Tab` → next repository tab activated
- **repo-overview-shift-tab-cycles-tabs-backward**: Press `Shift+Tab` → previous repository tab activated
- **repo-overview-number-jumps-to-tab**: Press `2` → second repository tab activated
- **repo-overview-q-pops-screen**: Press `q` → returns to previous screen (dashboard or repo list)
- **repo-overview-esc-pops-screen**: Press `Esc` → same as `q`
- **repo-overview-R-retries-on-error**: In error state, press `R` → fetch retried
- **repo-overview-R-no-op-when-loaded**: Press `R` when loaded → no effect
- **repo-overview-question-mark-help**: Press `?` → help overlay shows all keybindings for this screen
- **repo-overview-enter-on-fork-navigates**: On fork indicator, press `Enter` → parent repo overview pushed
- **repo-overview-rapid-j-presses**: Send `j` 20 times → content scrolls down 20 lines sequentially
- **repo-overview-s-during-inflight-star**: Press `s` twice rapidly → only one star request, no double-toggle

### Responsive Tests

- **repo-overview-80x24-layout**: Terminal 80×24 → metadata labels 12 chars, stats stacked vertically, clone URL truncated
- **repo-overview-80x24-topics-wrap**: Terminal 80×24 with 10 topics → topics wrap across multiple lines
- **repo-overview-80x24-no-readme-truncation**: Terminal 80×24 with README → README scrollable, not truncated
- **repo-overview-120x40-layout**: Terminal 120×40 → full layout, metadata labels 18 chars, stats on one line, clone URL full
- **repo-overview-120x40-all-sections**: Terminal 120×40 → header, metadata, stats, topics, description, README all visible on initial render
- **repo-overview-200x60-layout**: Terminal 200×60 → expanded layout, metadata labels 24 chars, extra spacing
- **repo-overview-resize-standard-to-min**: Resize 120×40 → 80×24 → layout adapts: stats stack, labels narrow, clone URL truncates
- **repo-overview-resize-min-to-standard**: Resize 80×24 → 120×40 → layout expands: stats inline, labels wider, clone URL full
- **repo-overview-resize-preserves-scroll**: Resize at any breakpoint → scroll position preserved
- **repo-overview-resize-during-load**: Resize during initial fetch → renders at new size when data arrives

### Integration Tests

- **repo-overview-auth-expiry**: 401 on repo fetch → app-shell auth error screen, not inline error
- **repo-overview-rate-limit-429**: 429 with Retry-After: 30 → "Rate limited. Retry in 30s."
- **repo-overview-network-error**: Network timeout → inline error with "Press R to retry"
- **repo-overview-server-error-500**: 500 on fetch → inline error with "Press R to retry"
- **repo-overview-readme-partial-failure**: Repo loads but README fails → metadata renders, README section shows "Unable to load README."
- **repo-overview-star-then-back-preserves**: Star a repo, press `q`, re-enter → star state preserved (fetched fresh)
- **repo-overview-deep-link-launch**: Launch with `--screen repos --repo owner/repo` → repo overview rendered, breadcrumb "Dashboard > owner/repo"
- **repo-overview-goto-from-deep-stack**: Navigate 3 deep, press `g r` then navigate to repo → repo overview rendered with correct stack
- **repo-overview-q-returns-to-source**: Enter from dashboard repos list, `q` → dashboard with repos list focused and scroll preserved
- **repo-overview-concurrent-load**: Navigate to repo overview while previous screen is still unmounting → no flicker, clean transition
