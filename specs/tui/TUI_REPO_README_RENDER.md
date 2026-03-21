# TUI_REPO_README_RENDER

Specification for TUI_REPO_README_RENDER.

## High-Level User POV

The README render is the primary content section at the bottom of the repository overview screen. When a user navigates to any repository in the Codeplane TUI — whether from the dashboard, the repository list, a deep link, or the command palette — the README is the largest and most prominent content block they encounter after scrolling past the metadata, stats, topics, and description.

The README is fetched independently from the repository metadata. While the header, metadata, and stats appear immediately from the repository response, the README section shows a lightweight "Loading README…" indicator until the separate README fetch completes. Once loaded, the raw markdown content is rendered using OpenTUI's `<markdown>` component, which supports headings (all six levels, rendered with decreasing visual weight), ordered and unordered lists (including nested lists), code blocks with syntax highlighting (fenced and indented), inline code spans, bold and italic text, blockquotes with left-border styling, horizontal rules, links (shown as underlined text with the URL displayed inline in muted color), and tables (rendered with box-drawing characters).

The rendered README respects the available terminal width. At minimum size (80×24), the markdown wraps tightly within the content area, code blocks scroll horizontally if they exceed the viewport width, and deeply nested lists compress to fit. At standard size (120×40), the README renders with comfortable margins and code blocks have room to display most typical line lengths without horizontal scrolling. At large sizes (200×60+), the README content has generous padding and long code blocks render at their full width.

The README section is fully scrollable within the parent scrollbox. There is no separate scrollbox for the README alone — it flows naturally as part of the repository overview's single vertical scroll. The user scrolls through the entire overview with `j`/`k` for line-by-line movement, `Ctrl+D`/`Ctrl+U` for page movement, and `G`/`g g` for jumping to the bottom or top. Since the README is often the longest section, these controls allow efficient navigation through lengthy documentation.

If the repository has no README file, a muted-color message reads "No README found." in place of the markdown content. If the README fetch fails while the repository metadata loads successfully, the README section shows "Unable to load README." in muted text with a subtle hint: "Press `R` to retry." — and pressing `R` refetches only the README, not the entire page. The rest of the repository overview (metadata, stats, topics, description) remains fully visible and interactive during a README failure.

The README supports several file name conventions: `README.md`, `README.markdown`, `README.txt`, `README`, `readme.md`, and case-insensitive variants. The API resolves the correct file; the TUI does not perform filename resolution. If the README content is a plain text file (no markdown extension), it is rendered as monospace preformatted text inside a `<code>` block rather than through the markdown renderer.

A separator line (a horizontal rule using box-drawing characters) visually distinguishes the README from the preceding sections (description, topics, or stats). The separator is rendered in `border` color and spans the full content width. Above the separator, a section label reads "README" in bold, giving the section a clear visual anchor point in the scroll.

For very large README files, the TUI enforces a 10,000-line rendering cap. If the raw markdown exceeds 10,000 lines, the TUI renders the first 10,000 lines and appends a muted message: "README truncated at 10,000 lines. View the full file in the code explorer." with a hint that pressing `e` navigates to the code explorer where the full file is accessible.

## Acceptance Criteria

### Definition of Done

- The README section renders within the repository overview screen's scrollbox, below the description section (or below topics/stats/metadata if no description exists)
- README content is fetched via `useRepoReadme(owner, repo)` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/readme`
- The `useRepoReadme` hook returns `{ content: string | null, isLoading: boolean, error: Error | null, contentType: "markdown" | "plaintext", filename: string | null }`
- A horizontal separator line renders above the README section using `border` color box-drawing characters (─)
- A "README" section label in bold text renders below the separator, with the detected filename shown in muted text (e.g., "README" followed by `readme.md` in gray)
- Markdown content is rendered using the `<markdown>` component with full support: headings (h1–h6), lists (ordered, unordered, nested), code blocks (fenced with language hint, indented), inline code, bold, italic, blockquotes, horizontal rules, links, and tables
- Plain text READMEs (no `.md`/`.markdown` extension) render inside a `<code>` block as monospace preformatted text
- Code blocks within the markdown display syntax highlighting when a language identifier is present in the fence
- Links render as underlined text with the URL shown in parentheses in muted color
- Tables render with Unicode box-drawing characters (─, │, ┌, ┐, └, ┘, ├, ┤, ┬, ┴, ┼)
- If no README exists (`content` is null), the section shows "No README found." in muted color
- If the README fetch fails, the section shows "Unable to load README." in muted text with "Press `R` to retry."
- Pressing `R` when the README is in an error state triggers a refetch of only the README (not the entire page)
- README content flows within the parent overview scrollbox — no nested scrollbox
- The README is scrollable via the parent scrollbox controls: `j`/`k`, `Ctrl+D`/`Ctrl+U`, `G`/`g g`
- The loading state shows "Loading README…" in muted text in place of the markdown content, while metadata/stats/topics/description are already visible
- README content renders incrementally — partial markdown is displayed as it becomes available if the response streams
- READMEs exceeding 10,000 lines are truncated with a visible message: "README truncated at 10,000 lines. View the full file in the code explorer."
- Pressing `e` from the truncation message navigates to the code explorer with the README file pre-selected
- The README section occupies the full available width of the content area minus horizontal padding (paddingX=1, so width = terminal_width - 2)
- Terminal resize recalculates the markdown layout synchronously; text re-wraps, code blocks adjust horizontal overflow, tables recalculate column widths

### Keyboard Interactions

All keybindings are inherited from the repository overview screen. The README section adds no new keybindings but participates in:

- `j` / `Down`: Scroll parent scrollbox down, scrolling through README content
- `k` / `Up`: Scroll parent scrollbox up, scrolling through README content
- `Ctrl+D`: Page down through README and other sections
- `Ctrl+U`: Page up through README and other sections
- `G`: Scroll to absolute bottom (typically end of README for repos with long documentation)
- `g g`: Scroll to absolute top (header section)
- `R`: Retry README fetch (when README is in error state) — also retries repo fetch if that failed
- `e`: Navigate to code explorer (always available; from truncation message, pre-selects README file)
- `?`: Help overlay includes README-relevant scroll keybindings

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by the router — README not rendered
- 80×24 – 119×39 (minimum): Markdown content wraps tightly at terminal width minus 2 chars padding. Code blocks that exceed content width render with `…` trailing indicator (content is not horizontally scrollable at minimum — long lines are truncated with ellipsis). Tables with many columns collapse: only the first columns that fit are shown, remaining marked with `…`. Blockquote left-border uses a single `│` character. Nested lists indent by 2 characters per level. Section label "README" omits the filename detail
- 120×40 – 199×59 (standard): Markdown renders with full width. Code blocks up to 116 characters wide render without truncation; longer lines show trailing `…`. Tables render with full box-drawing borders. Blockquote left-border uses `┃` with 1-character indent. Nested lists indent by 3 characters per level. Section label shows "README" with filename in muted text
- 200×60+ (large): Extra left/right margin (2 chars each) for visual breathing room. Code blocks up to 192 characters wide. Tables render with generous column padding. Heading h1 underlined with `═` characters. Nested lists indent by 4 characters per level

### Truncation and Boundary Constraints

- README raw content maximum: no size limit from the API, but rendering capped at 10,000 lines
- Line length in code blocks: truncated with trailing `…` when exceeding content area width at each breakpoint (76/116/192 chars)
- Heading text: never truncated — wraps to next line if exceeding width
- Link URLs in parentheses: truncated at 60 characters with `…` if the URL is longer
- Table cell content: truncated with `…` if exceeding column-allocated width (columns are auto-sized to fit available width, minimum 5 chars per column)
- Blockquote depth: maximum 5 levels of nesting rendered (deeper levels render flat at level 5)
- List nesting: maximum 8 levels rendered (deeper levels render flat at level 8)
- Inline code spans: never truncated — wrap to next line
- The "README truncated" message is always a single line and never itself truncated

### Edge Cases

- Terminal resize while scrolled deep into README: scroll position preserved relative to content line, markdown re-wraps at new width
- Rapid scrolling through long README: `j`/`k` presses processed sequentially with no debouncing; smooth scroll through rendered markdown
- README with no markdown content (empty string): renders the separator and label, but the content area shows "Empty README." in muted color
- README with only whitespace: treated as empty — shows "Empty README." message
- README with binary content: API returns error, TUI shows "Unable to load README." (binary files are not READMEs)
- README containing ANSI escape sequences: sequences are stripped before markdown parsing to prevent display corruption
- README with extremely wide code blocks (500+ chars): truncated at content width with `…`; no horizontal scrolling
- README with deeply nested blockquotes (10+ levels): flattened to 5 levels maximum
- README with extremely large table (50+ columns): only columns that fit in viewport rendered; trailing `…` indicator
- README with HTML tags: HTML is not rendered — tags are displayed as literal text (security constraint)
- README that is a `.txt` file: rendered as preformatted monospace text in `<code>`, not through `<markdown>`
- README that is a file named `README` with no extension: rendered as preformatted monospace text
- README with front matter (YAML between `---` fences): front matter is stripped and not displayed
- Simultaneous repo metadata success + README 404: metadata renders fully, README section shows "No README found." — no cascade
- Simultaneous repo metadata success + README 500: metadata renders fully, README section shows "Unable to load README." with retry hint
- README fetch in-flight when user presses `q` to leave: fetch is cancelled, no orphaned requests
- Repository overview re-entered after previously loading README: README is refetched (not cached between navigation visits)
- SSE disconnect during README rendering: README is unaffected (uses REST, not SSE)
- Unicode in README content (emoji, CJK, RTL): rendered correctly, width calculations account for double-width characters

## Design

### Layout Structure

The README section is positioned as the final content section within the repository overview's `<scrollbox>`:

```
<scrollbox flexGrow={1}>
  <box flexDirection="column" gap={1} paddingX={1}>

    {/* ... header, metadata, stats, topics, fork indicator, description sections ... */}

    {/* README separator */}
    <box height={1}>
      <text color="border">{"─".repeat(contentWidth)}</text>
    </box>

    {/* README section label */}
    <box flexDirection="row" gap={1} height={1}>
      <text bold>README</text>
      {readmeFilename && breakpoint !== "minimum" && (
        <text color="muted">{readmeFilename}</text>
      )}
    </box>

    {/* README content */}
    {readmeState === "loading" && (
      <box>
        <text color="muted">Loading README…</text>
      </box>
    )}

    {readmeState === "error" && (
      <box>
        <text color="muted">Unable to load README.</text>
        <text color="muted"> Press R to retry.</text>
      </box>
    )}

    {readmeState === "empty" && (
      <box>
        <text color="muted">No README found.</text>
      </box>
    )}

    {readmeState === "empty-content" && (
      <box>
        <text color="muted">Empty README.</text>
      </box>
    )}

    {readmeState === "plaintext" && (
      <box>
        <code>{readmeContent}</code>
      </box>
    )}

    {readmeState === "markdown" && (
      <box>
        <markdown>{truncatedContent}</markdown>
        {isTruncated && (
          <box marginTop={1}>
            <text color="muted">
              README truncated at 10,000 lines. View the full file in the code explorer.
            </text>
          </box>
        )}
      </box>
    )}

  </box>
</scrollbox>
```

### Visual Treatment

**Separator line**: Rendered using `─` repeated to fill the content width. Color: `border` (ANSI 240).

**Section label**: "README" in bold default color. Filename (e.g., `readme.md`) in muted color (ANSI 245), shown at standard and large breakpoints only.

**Markdown headings**:
- h1: Bold, underlined with `═` at large breakpoint. Preceded by 1 blank line
- h2: Bold. Preceded by 1 blank line
- h3: Bold, muted prefix `###`
- h4–h6: Muted, increasingly indented

**Code blocks**: Background color `surface` (ANSI 236). Language hint shown in muted text at the top-right of the block. Syntax highlighting via `<code>` component.

**Inline code**: Rendered with `surface` background, no additional styling.

**Blockquotes**: Left-bordered with `│` (minimum) or `┃` (standard/large) in `muted` color. Text indented after the border character.

**Links**: Link text underlined in `primary` color. URL shown in parentheses in `muted` color immediately after. Example: `Getting Started (https://example.com/start)`

**Tables**: Full box-drawing borders. Header row in bold. Columns auto-sized. Alignment markers (`:---`, `:---:`, `---:`) respected.

**Lists**: Unordered uses `•` at first level, `◦` at second, `▪` at third, cycling. Ordered uses `1.`, `2.`, etc. Nested lists indented by 2/3/4 chars per level (minimum/standard/large).

**Horizontal rules**: Rendered as `─` repeated to content width, in `border` color.

**Bold**: Rendered with ANSI bold attribute.

**Italic**: Rendered with ANSI dim or italic attribute (terminal-dependent).

### Keybinding Reference

The README section inherits all keybindings from the parent repository overview screen. No additional keybindings are introduced. Relevant inherited bindings:

| Key | Action | Context |
|-----|--------|--------|
| `j` / `Down` | Scroll down through README | Scrollbox focused |
| `k` / `Up` | Scroll up through README | Scrollbox focused |
| `Ctrl+D` | Page down (half visible height) | Scrollbox focused |
| `Ctrl+U` | Page up (half visible height) | Scrollbox focused |
| `G` | Scroll to bottom (end of README) | Scrollbox focused |
| `g g` | Scroll to top (header section) | Scrollbox focused |
| `R` | Retry README fetch | README error state |
| `e` | Navigate to code explorer | Always (pre-selects README if truncated) |
| `?` | Help overlay | Always |

### Responsive Column Layout

**80×24 (minimum)**: Content width = 78 chars (terminal width 80 − paddingX 2). Code blocks truncate at 76 chars (border padding). Tables collapse columns. Section label shows only "README". Markdown wraps aggressively.

**120×40 (standard)**: Content width = 118 chars. Code blocks render up to 116 chars. Full table rendering. Section label shows "README readme.md". Comfortable line lengths for prose.

**200×60 (large)**: Content width = 198 chars, but markdown content area uses inner margins of 2 chars each side (effective 194). Code blocks render up to 192 chars. Heading h1 has `═` underline. Generous spacing.

### Data Hooks

- `useRepoReadme(owner, repo)` from `@codeplane/ui-core` — returns `{ content: string | null, isLoading: boolean, error: Error | null, contentType: "markdown" | "plaintext", filename: string | null }`. Calls `GET /api/repos/:owner/:repo/readme`. Returns `content: null` if no README exists. Returns `contentType: "plaintext"` for `.txt` and extensionless files
- `useTerminalDimensions()` — for calculating content width and responsive breakpoints
- `useOnResize()` — triggers synchronous re-layout, markdown re-wraps

### State Machine

The README section has the following states:

1. **loading**: `isLoading` is true. Shows "Loading README…"
2. **markdown**: `content` is non-null, non-empty, and `contentType` is `"markdown"`. Renders via `<markdown>`
3. **plaintext**: `content` is non-null, non-empty, and `contentType` is `"plaintext"`. Renders via `<code>`
4. **empty**: `content` is null (no README file exists). Shows "No README found."
5. **empty-content**: `content` is `""` or whitespace-only. Shows "Empty README."
6. **error**: `error` is non-null. Shows "Unable to load README." with retry hint
7. **truncated**: `content` exceeds 10,000 lines. Renders first 10,000 lines with truncation message

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (no access) | Read-Only | Member | Admin | Owner |
|--------|-----------|---------------------------|-----------|--------|-------|-------|
| View README of public repo | ❌ (TUI requires auth) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View README of private repo | ❌ | ❌ (404) | ✅ | ✅ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach the repository overview
- Private repositories return 404 for the README endpoint to users without read access, consistent with the repo metadata endpoint — does not leak existence
- There are no write actions in the README render feature (read-only display)
- README content is rendered as-is through the `<markdown>` or `<code>` components; HTML tags are displayed as literal text, not interpreted (prevents injection)

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed as Bearer header to `GET /api/repos/:owner/:repo/readme` via the shared API client
- Token is never displayed in the README content, never logged, never included in error messages
- 401 responses from the README endpoint propagate to the app-shell auth error screen

### Rate Limiting

- README endpoint shares the global authenticated rate limit: 5,000 requests per hour
- README is fetched once on screen mount and once per `R` retry — no polling, no auto-refresh
- If 429 is returned, the README section displays "Rate limited. Retry in {Retry-After}s." inline in muted text
- No auto-retry on rate limit

### Content Sanitization

- HTML tags in markdown are displayed as literal text (not interpreted as HTML)
- ANSI escape sequences embedded in README content are stripped before rendering
- JavaScript in markdown links (e.g., `javascript:` protocol) is displayed as text, not executed
- Image references in markdown (`![alt](url)`) render as `[Image: alt]` in muted text (no image rendering in TUI)
- README content from the API is treated as untrusted user input and passed through the `<markdown>` component's built-in sanitization

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.readme.loaded` | README content successfully fetched and rendered | `repo_full_name`, `readme_filename`, `content_type` (markdown/plaintext), `content_length_chars`, `content_length_lines`, `was_truncated`, `render_time_ms`, `terminal_width`, `terminal_height`, `breakpoint` |
| `tui.repo.readme.not_found` | README fetch returns null (no file) | `repo_full_name` |
| `tui.repo.readme.error` | README fetch fails | `repo_full_name`, `http_status`, `error_type` (network/not_found/auth/rate_limit/server) |
| `tui.repo.readme.retry` | User presses `R` to retry README fetch | `repo_full_name`, `previous_error_type`, `retry_success` |
| `tui.repo.readme.scroll_depth` | User scrolls past 25%/50%/75%/100% of README | `repo_full_name`, `scroll_depth_percent` (25/50/75/100), `readme_length_lines`, `time_on_screen_ms` |
| `tui.repo.readme.truncation_seen` | User scrolls to the truncation message | `repo_full_name`, `total_lines`, `truncated_at` (10000) |
| `tui.repo.readme.truncation_navigate` | User presses `e` from truncation message | `repo_full_name`, `readme_filename` |

### Success Indicators

- **README availability rate**: Percentage of repo overview views where a README is present (track trend, no target — depends on repo quality)
- **README load success rate**: Percentage of README fetch attempts that succeed (target: >98%)
- **README render time p95**: 95th percentile time from fetch complete to render complete (target: <200ms for READMEs under 1,000 lines)
- **README engagement rate**: Percentage of repo overview views where the user scrolls into the README section (target: >40%)
- **README deep scroll rate**: Percentage of README-engaged views where the user scrolls past 50% (target: >20%)
- **Truncation encounter rate**: Percentage of README views that hit the 10,000-line cap (monitor, target: <1%)
- **README error rate**: Percentage of README fetches that fail (target: <2%)
- **Retry success rate**: Percentage of retry attempts that succeed (target: >80%)

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | README loaded | `repo_full_name`, `filename`, `content_type`, `content_length_lines`, `render_time_ms` |
| `info` | README not found | `repo_full_name` |
| `info` | README retry triggered | `repo_full_name`, `previous_error_type` |
| `warn` | README fetch failed | `repo_full_name`, `http_status`, `error_message` (sanitized, no token) |
| `warn` | README rate limited | `repo_full_name`, `retry_after_seconds` |
| `warn` | README content truncated | `repo_full_name`, `total_lines`, `truncated_at` (10000) |
| `warn` | ANSI escape sequences stripped from README | `repo_full_name`, `stripped_sequence_count` |
| `debug` | README markdown render started | `repo_full_name`, `content_length_chars` |
| `debug` | README markdown render completed | `repo_full_name`, `render_time_ms`, `rendered_line_count` |
| `debug` | README section scroll position | `scroll_percent`, `visible_line_range` |
| `debug` | README resize re-render | `old_width`, `new_width`, `re_render_time_ms` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on README fetch | Hook timeout (30s) | "Unable to load README." with "Press R to retry." Repo metadata unaffected |
| README not found (404 from dedicated endpoint) | API returns 404 or null content | "No README found." in muted text. Not an error state — expected for repos without READMEs |
| README endpoint returns 500 | API returns 5xx | "Unable to load README." with retry hint. Repo metadata unaffected |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | "Rate limited. Retry in Ns." inline in README section |
| README content exceeds 10,000 lines | Line count check post-fetch | First 10,000 lines rendered, truncation message appended |
| README contains ANSI escape sequences | Pre-render sanitization detects sequences | Sequences stripped silently; warn log emitted |
| README contains invalid UTF-8 | Markdown parser encounters invalid bytes | Replacement character (�) substituted; rendering continues |
| Terminal resize during README render | `useOnResize` fires during render | Render restarts at new width; no visible flicker (React reconciles) |
| README fetch cancelled (user navigated away) | Component unmount during fetch | Fetch aborted via AbortController; no orphaned state updates |
| Markdown parser error on malformed content | Parser throws | Fallback: render as preformatted text in `<code>` block; warn log emitted |
| Memory pressure from large README | Content exceeds rendering budget | 10,000-line cap prevents unbounded memory. Scrollbox virtualizes offscreen content |

### Failure Modes

- **Total README failure, repo loads**: Repo metadata, stats, topics, description render normally. README section shows error message. Header bar and status bar remain stable. All keybindings except `R`-retry work normally
- **README loads, then terminal resizes to minimum**: Markdown re-wraps. Code blocks truncate. Tables collapse columns. No content lost — scroll position preserved
- **README fetch slow (>5s)**: "Loading README…" indicator remains visible while user can scroll and interact with the already-loaded metadata sections above
- **Markdown parser fallback**: If the `<markdown>` component fails to parse the content, the README falls back to `<code>` preformatted rendering. The user sees the raw markdown source rather than a blank section

## Verification

### Test File: `e2e/tui/repository.test.ts`

### Terminal Snapshot Tests

- **readme-render-markdown-full**: Navigate to repo with README.md → snapshot shows separator line, "README" label with filename, rendered markdown with headings, code blocks, lists, and bold text
- **readme-render-heading-levels**: Repo with README containing h1–h6 → snapshot shows decreasing visual weight for each heading level
- **readme-render-code-block-highlighted**: Repo with README containing fenced code block with language → snapshot shows syntax-highlighted code with `surface` background
- **readme-render-code-block-no-language**: Repo with README containing fenced code block without language → snapshot shows monospace code without syntax highlighting
- **readme-render-inline-code**: Repo with README containing inline `code` spans → snapshot shows inline code with background styling
- **readme-render-blockquote**: Repo with README containing blockquotes → snapshot shows left-border `│` with indented text
- **readme-render-nested-blockquote**: Repo with README with 3-level nested blockquotes → snapshot shows increasing indentation with border characters
- **readme-render-ordered-list**: Repo with README containing ordered list → snapshot shows numbered items with correct indentation
- **readme-render-unordered-list**: Repo with README containing unordered list → snapshot shows bullet characters (`•`) with indentation
- **readme-render-nested-list**: Repo with README with 3-level nested lists → snapshot shows increasing indentation with different bullet characters at each level
- **readme-render-table**: Repo with README containing markdown table → snapshot shows table with box-drawing characters and bold header row
- **readme-render-link**: Repo with README containing links → snapshot shows underlined text with URL in muted parentheses
- **readme-render-horizontal-rule**: Repo with README containing `---` → snapshot shows full-width `─` line in border color
- **readme-render-bold-italic**: Repo with README containing **bold** and *italic* → snapshot shows bold and dim/italic ANSI attributes
- **readme-render-image-reference**: Repo with README containing `![alt](url)` → snapshot shows `[Image: alt]` in muted text
- **readme-render-plaintext-readme**: Repo with README (no .md extension) → snapshot shows preformatted monospace text in code block
- **readme-render-txt-readme**: Repo with README.txt → snapshot shows preformatted monospace text in code block
- **readme-render-no-readme**: Repo with no README file → snapshot shows "No README found." in muted text below separator
- **readme-render-empty-readme**: Repo with empty README.md → snapshot shows "Empty README." in muted text below separator
- **readme-render-loading-state**: Navigate to repo with slow README fetch → snapshot shows "Loading README…" below separator while metadata is visible above
- **readme-render-error-state**: README fetch returns 500 → snapshot shows "Unable to load README." with retry hint below separator
- **readme-render-rate-limited**: README fetch returns 429 with Retry-After: 60 → snapshot shows "Rate limited. Retry in 60s."
- **readme-render-separator-line**: Navigate to any repo → snapshot confirms horizontal `─` separator in border color above README section
- **readme-render-section-label**: Navigate to repo → snapshot confirms "README" in bold with filename in muted text
- **readme-render-truncated**: Repo with README exceeding 10,000 lines → snapshot shows rendered content ending with truncation message
- **readme-render-html-literal**: Repo with README containing `<div>` tags → snapshot shows literal `<div>` text, not interpreted HTML
- **readme-render-front-matter-stripped**: Repo with README containing YAML front matter → snapshot shows content without front matter block

### Keyboard Interaction Tests

- **readme-scroll-j-through-readme**: Navigate to repo with long README, scroll down with `j` repeatedly → content scrolls through README section line by line
- **readme-scroll-k-back-up**: Scroll into README, press `k` → content scrolls back up through README
- **readme-scroll-ctrl-d-page-through-readme**: Press `Ctrl+D` → scrolls half-page through README content
- **readme-scroll-ctrl-u-page-back**: Scroll deep into README, `Ctrl+U` → scrolls half-page back
- **readme-scroll-G-to-end-of-readme**: Press `G` → scrollbox at bottom, which is the end of README (or truncation message)
- **readme-scroll-gg-to-top**: From deep in README, press `g g` → scrollbox at top (header section, not README top)
- **readme-R-retries-fetch**: README in error state, press `R` → "Loading README…" appears, then content loads on success
- **readme-R-retries-only-readme**: Repo metadata loaded, README failed, press `R` → only README refetches, metadata stays stable
- **readme-R-no-op-when-loaded**: README loaded successfully, press `R` → no effect on README section (R refreshes entire page via parent)
- **readme-e-navigates-code-explorer**: Press `e` → code explorer screen pushed
- **readme-e-from-truncation**: README truncated, scroll to truncation message, press `e` → code explorer pushed with README file pre-selected
- **readme-rapid-scroll-through-long-readme**: Send `j` 50 times on repo with long README → content scrolls through 50 lines without lag or skipped frames

### Responsive Tests

- **readme-80x24-markdown-wraps**: Terminal 80×24 with README → prose wraps at 78 chars, code blocks truncate at 76
- **readme-80x24-table-collapses**: Terminal 80×24 with README containing wide table → table shows only columns that fit, trailing `…`
- **readme-80x24-code-block-truncates**: Terminal 80×24 with code block having 120-char lines → lines truncated with `…` at 76 chars
- **readme-80x24-section-label-short**: Terminal 80×24 → section label shows "README" without filename
- **readme-80x24-nested-list-compact**: Terminal 80×24 with 4-level nested list → 2-char indent per level, fits within width
- **readme-120x40-full-render**: Terminal 120×40 with README → full markdown rendering, code blocks up to 116 chars, section label with filename
- **readme-120x40-table-full**: Terminal 120×40 with moderate table → full table with box-drawing borders
- **readme-200x60-generous-margins**: Terminal 200×60 with README → content has inner margins, h1 underlined with `═`
- **readme-200x60-wide-code-blocks**: Terminal 200×60 with README with wide code block → renders up to 192 chars without truncation
- **readme-resize-120-to-80**: Terminal resizes 120×40 → 80×24 → markdown re-wraps, code blocks truncate, section label shortens
- **readme-resize-80-to-120**: Terminal resizes 80×24 → 120×40 → markdown expands, code blocks restore, filename appears in label
- **readme-resize-preserves-scroll**: At 120×40, scroll into README, resize to 80×24 → scroll position preserved relative to content
- **readme-resize-during-loading**: Resize terminal while README is loading → renders at new size when data arrives

### Integration Tests

- **readme-partial-failure-no-cascade**: Repo loads successfully, README returns 500 → metadata/stats/topics/description render, README section shows error, all keybindings work
- **readme-auth-expiry-on-readme-fetch**: README endpoint returns 401 → app-shell auth error screen shown (same as repo-level 401)
- **readme-rate-limit-inline**: README returns 429 with Retry-After: 30 → "Rate limited. Retry in 30s." shown inline in README section only
- **readme-large-file-truncation**: README with 15,000 lines → first 10,000 rendered, truncation message visible at bottom
- **readme-ansi-stripped**: README containing raw ANSI escape codes → codes stripped, clean text rendered
- **readme-fetch-cancelled-on-navigate**: Start README fetch, press `q` before complete → no error, clean navigation back
- **readme-markdown-parser-fallback**: README with malformed markdown that crashes parser → falls back to `<code>` preformatted rendering
- **readme-concurrent-with-metadata**: Navigate to repo → metadata renders first (from faster endpoint), README appears when its fetch completes
- **readme-deep-link-loads-readme**: Launch `codeplane tui --screen repos --repo owner/repo` → repo overview with README rendered
