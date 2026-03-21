# JJ_FILE_PREVIEW_MARKDOWN

Specification for JJ_FILE_PREVIEW_MARKDOWN.

## High-Level User POV

When browsing a jj-native repository on Codeplane, developers encounter markdown files constantly — READMEs, documentation, changelogs, contributing guides, design specs, and architectural decision records. Today, markdown files are displayed as raw syntax-highlighted text, which is perfectly functional for editing but poor for reading. The developer sees pound signs, asterisks, backtick fences, and bracket-link syntax instead of formatted headings, bold text, code blocks, and clickable links. For a developer trying to understand a project's documentation without cloning it, this creates unnecessary friction.

With markdown preview, Codeplane renders `.md` and `.markdown` files as richly formatted documents wherever file content is displayed. In the web UI's Code Explorer, selecting a markdown file shows a beautifully rendered document with proper headings, styled code blocks with syntax highlighting, tables, task lists, blockquotes, and clickable links. A toggle lets the developer switch between the rendered view and the raw source, so they can both read the documentation and inspect the markdown syntax when needed. In a landing request review, when a change modifies a markdown file, the reviewer can see both the raw diff and a rendered preview of how the documentation will look after the change lands.

In the TUI, markdown files are rendered using terminal-native formatting — bold and italic ANSI styles, indented blockquotes, colored headings, and syntax-highlighted code blocks — using the same OpenTUI markdown component that already powers issue bodies and agent responses. The TUI experience turns a wall of raw markdown punctuation into a readable document.

In the CLI, `codeplane change cat` on a markdown file outputs the raw content by default (since that's what you want when piping), but a `--rendered` flag outputs a terminal-formatted version using ANSI escape codes. The `--json` response includes a `is_markdown: true` indicator so programmatic consumers know the content can be rendered.

Markdown preview is not limited to the code explorer. Any Codeplane surface that displays file content — change detail views, landing request file viewers, agent context panels, and the future README rendering on repository overview pages — benefits from rendered markdown. The preview supports GitHub Flavored Markdown (GFM), which is the de facto standard for software documentation: tables, task lists, strikethrough, autolinks, and fenced code blocks with language-specific syntax highlighting.

The feature also handles markdown-specific nuances. Relative links within the rendered document (e.g., `[see setup](./SETUP.md)`) resolve to the correct Codeplane file browser path for the current change, so clicking a relative link navigates to that file in the repository rather than producing a broken link. Relative image references (e.g., `![diagram](./docs/arch.png)`) resolve to the file content API endpoint so images render inline within the markdown preview. Heading anchors are generated so that fragment links (e.g., `#installation`) scroll to the correct section.

## Acceptance Criteria

### Definition of Done

- [ ] Markdown files (`.md`, `.markdown`) are detected via the `language: "markdown"` field already returned by the file content API.
- [ ] The web UI Code Explorer renders markdown files as formatted HTML by default, with a Source/Rendered toggle to switch between views.
- [ ] The rendered view supports the full GitHub Flavored Markdown spec: headings (h1–h6), paragraphs, bold, italic, strikethrough, inline code, fenced code blocks with syntax highlighting, tables, task lists (checkboxes), blockquotes, ordered/unordered lists, horizontal rules, links, and images.
- [ ] Relative links in rendered markdown resolve to the correct Codeplane file browser path within the same repository and change context.
- [ ] Relative image references in rendered markdown resolve to the file content API and render inline.
- [ ] Heading anchors are generated and fragment links scroll to the correct heading.
- [ ] The TUI renders markdown files using the OpenTUI `<markdown>` component with terminal-native formatting.
- [ ] The CLI `change cat` on markdown files outputs raw content by default and supports `--rendered` for ANSI-formatted terminal output.
- [ ] The CLI `--json` response includes `is_markdown: true` for markdown files.
- [ ] Landing request diff views for markdown files offer a rendered preview alongside the raw diff.
- [ ] Math expressions (LaTeX via `$...$` and `$$...$$`) render correctly in the web UI using KaTeX.
- [ ] YAML frontmatter blocks are hidden from the rendered view but visible in source view.
- [ ] E2E tests cover rendering, toggle behavior, link resolution, edge cases, and all client surfaces.
- [ ] Documentation is updated for API reference, web guide, CLI reference, and TUI guide.

### Functional Constraints

- [ ] Supported file extensions: `.md`, `.markdown`. Detection uses the existing `detectLanguage()` function which returns `"markdown"` for the `md` extension. The `.markdown` extension must be added if not already present.
- [ ] GFM compliance: the markdown parser must pass the GitHub Flavored Markdown specification test suite for the supported features.
- [ ] Maximum markdown file size for rendering: 1 MB of raw content. Files larger than 1 MB display a banner "File too large to render — showing source" and fall back to syntax-highlighted source view. The 1 MB limit is independent of the existing 5 MB API truncation limit.
- [ ] Maximum rendered HTML output size: 2 MB. If the rendered output exceeds this, fall back to source view with a warning.
- [ ] Fenced code blocks must use the same syntax highlighting engine as the text file preview.
- [ ] Code blocks without a language specifier render as plain monospace text with no highlighting.
- [ ] Task list items render as non-interactive checkboxes (display only).
- [ ] Table alignment (`:---`, `:---:`, `---:`) must be respected in rendered output.
- [ ] HTML blocks in markdown are sanitized: `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<textarea>`, `<button>`, event handler attributes, and `javascript:` URLs are stripped. Safe HTML (`<details>`, `<summary>`, `<sup>`, `<sub>`, `<kbd>`, `<br>`, `<hr>`, `<img>` with allowed src) is preserved.
- [ ] Relative links resolve using the pattern `/:owner/:repo/code/:change_id/<resolved_path>`. Links beginning with `http://`, `https://`, or `//` are treated as absolute and open in a new tab.
- [ ] Relative image `src` attributes resolve to `GET /api/repos/:owner/:repo/file/:change_id/<resolved_path>?encoding=base64`.
- [ ] Images referenced in markdown that exceed 20 MB show the image metadata card (per JJ_FILE_PREVIEW_IMAGE spec).
- [ ] Heading anchor IDs are generated by lowercasing, replacing spaces with hyphens, and stripping non-alphanumeric characters (matching GitHub's algorithm). Duplicate headings append `-1`, `-2`, etc.
- [ ] Fragment links scroll smoothly to the target heading.
- [ ] External links include `rel="noopener noreferrer"` and `target="_blank"`.
- [ ] Empty markdown files (0 bytes) show "Empty file" message.
- [ ] Markdown files containing only whitespace show "No visible content" indicator.
- [ ] The `is_markdown` field in the API response is `true` when `language === "markdown"`.
- [ ] The Source/Rendered toggle state persists in the user's workbench preferences store.

### Edge Cases

- [ ] Markdown file with only frontmatter (no body): rendered view shows empty content; source view shows the frontmatter.
- [ ] Markdown with deeply nested lists (10+ levels): renders correctly without layout overflow.
- [ ] Markdown with a table containing 100+ columns: horizontal scroll within the table container.
- [ ] Markdown with a table containing 10,000+ rows: renders up to the first 500 rows with truncation banner.
- [ ] Markdown with fenced code block containing 10,000+ lines: syntax highlighting applied to the first 1,000 lines; remainder rendered as plain text.
- [ ] Markdown with a single line exceeding 100,000 characters: line wraps in rendered view.
- [ ] Relative link `[link](../other-file.md)` resolving above the repository root: clamps to repository root.
- [ ] Relative link to a non-existent file: renders normally; clicking navigates to 404.
- [ ] Image reference to a non-image file: shows broken image icon with alt text.
- [ ] Image reference to a file larger than 20 MB: shows image metadata card.
- [ ] `<details><summary>` blocks: collapsible in web UI; visible content in TUI.
- [ ] Emoji shortcodes (`:rocket:`): rendered as Unicode emoji.
- [ ] Markdown file at exactly 1 MB: rendered view activates.
- [ ] Markdown file at 1 MB + 1 byte: falls back to source view.
- [ ] `<script>alert('xss')</script>`: script tag stripped.
- [ ] `![img](javascript:alert('xss'))`: `javascript:` URL stripped.
- [ ] `[click](javascript:void(0))`: `javascript:` link stripped.
- [ ] Mixed content with base64 data URIs: `image/*` data URIs allowed; others stripped.
- [ ] Windows-style line endings (`\r\n`): renders identically to Unix endings.
- [ ] BOM (byte order mark): stripped before rendering.

## Design

### API Shape

The markdown preview feature does **not** introduce new API endpoints. It extends the existing file content API responses.

**Extended fields on `GET /api/repos/:owner/:repo/file/:change_id/*`**:

```json
{
  "path": "docs/README.md",
  "content": "# My Project\n\nWelcome to the project...",
  "encoding": "utf8",
  "language": "markdown",
  "size": 4096,
  "line_count": 120,
  "is_binary": false,
  "is_truncated": false,
  "is_markdown": true
}
```

The `is_markdown` field is `true` when `language === "markdown"`. No server-side HTML rendering — the API returns raw markdown. All rendering happens client-side. This is consistent with how Codeplane handles issue and wiki bodies.

### SDK Shape

New field on `FileContentResponse`:

```typescript
interface FileContentResponse {
  // ... existing fields ...
  is_markdown: boolean;
}
```

The `.markdown` extension must be added to `detectLanguage()` alongside the existing `md` extension.

### Web UI Design

**Code Explorer — Markdown Preview Panel**:

1. **File header bar**: File path, `MARKDOWN` badge (accent/documentation color), file size, line count. Two toggle buttons: `Rendered` (default active) and `Source`.

2. **Rendered view** (default for markdown files):
   - `max-width: 80ch` centered content column
   - Headings styled with appropriate hierarchy
   - Code blocks with rounded corners, subtle background, syntax highlighting, and copy button
   - Tables with horizontal rules, alternating row shading, horizontal scroll for wide tables
   - Blockquotes with left border accent and muted text
   - Task lists with checkbox icons (non-interactive)
   - Links in theme link color with underline on hover
   - Images rendered inline with `max-width: 100%`
   - Math expressions via KaTeX
   - Heading anchors with `#` link icon on hover (GitHub-style)
   - Optional table of contents sidebar via `Outline` button
   - Scroll position maintained separately per view mode

3. **Source view**: Same syntax-highlighted text view as JJ_FILE_PREVIEW_TEXT. YAML frontmatter visible and highlighted as YAML.

4. **Link behavior**:
   - Relative links: navigate within Code Explorer at same change ID
   - Absolute URLs: open in new tab
   - Fragment links: smooth-scroll to heading
   - Relative links to non-markdown files: navigate to appropriate preview type

5. **Image rendering within markdown**:
   - Relative paths resolve to file content API with `?encoding=base64`
   - Failed images show `[alt text]` in bordered placeholder
   - Images >20 MB show metadata card per JJ_FILE_PREVIEW_IMAGE
   - Click on image navigates to image preview panel

6. **Keyboard shortcuts**: `e` toggle source/rendered, `t` toggle outline, `j`/`k` scroll, `Ctrl+D`/`Ctrl+U` page, `G`/`gg` jump, `y` copy path, `Y` copy raw markdown.

7. **Oversized markdown (>1 MB)**: Banner with "too large to render" message, source view activates, rendered toggle disabled.

**Landing Request Diff — Markdown Preview**: `Preview` tab alongside diff showing rendered new version. Added files show full preview; deleted files show "File deleted"; modified files show rendered new version with explanatory banner.

### CLI Command

`codeplane change cat <change_id> <path>` extended for markdown:

| Flag | Behavior |
|------|----------|
| (default) | Raw markdown to stdout |
| `--rendered` | ANSI-formatted terminal output (bold headings, colored code blocks, indented blockquotes) |
| `--json` | Full JSON with `is_markdown: true` |
| `--info` | Summary including "Markdown: Yes" |

`--rendered` and `--json` are mutually exclusive. `--rendered` on non-markdown files produces an error.

### TUI UI

Markdown file in Code Explorer:
1. Preview pane uses OpenTUI `<markdown>` component
2. Header: `path | MARKDOWN | size | lines`
3. `Tab` toggles rendered/source
4. Rendered: bold headings, syntax-highlighted code blocks, `│` blockquotes, ASCII tables, `[x]`/`[ ]` task lists, underlined links
5. Images: `[image: alt text]` with download URL
6. Keybindings: `j`/`k` scroll, `Tab` toggle, `y` copy path, `Y` copy content, `/` search

### Neovim Plugin API

Buffer filetype set to `markdown` for markdown files. Users benefit from their existing markdown plugins (e.g., `render-markdown.nvim`, `glow.nvim`). No Codeplane-specific markdown rendering needed.

### Documentation

1. **Web Guide — Code Browsing** (`docs/guides/code-browsing.mdx`): "Markdown Preview" section covering toggle, shortcuts, link resolution, 1 MB limit, with screenshot.
2. **CLI Reference** (`docs/cli/change.mdx`): `--rendered` flag documentation with examples.
3. **TUI Guide** (`docs/tui/file-browsing.mdx`): "Markdown Files" section covering `Tab` toggle, terminal rendering.
4. **API Reference** (`docs/api/file-content.mdx`): `is_markdown` field documentation.

## Permissions & Security

### Authorization Matrix

Markdown preview uses the same authorization as the file content API. No additional permissions required.

| Role | Public Repository | Private Repository |
|------|-------------------|--------------------||
| Anonymous | ✅ View rendered and source | ❌ 401 |
| Authenticated (no repo access) | ✅ View rendered and source | ❌ 403 |
| Repository Read | ✅ View and download | ✅ View and download |
| Repository Write | ✅ View and download | ✅ View and download |
| Repository Admin | ✅ View and download | ✅ View and download |
| Owner | ✅ View and download | ✅ View and download |
| Org Member (team read) | ✅ View and download | ✅ View and download |
| Deploy Key (read) | ✅ View and download (via SSH/API) | ✅ View and download (via SSH/API) |

This is a read-only feature. Rendered preview is generated entirely client-side from raw content already authorized by the file content API.

### Rate Limiting

No additional rate limits beyond the file content API:

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 60 requests | per hour, per IP |
| Authenticated user | 5,000 requests | per hour, per token/session |
| Deploy key | 5,000 requests | per hour, per key |
| Agent session | 10,000 requests | per hour, per session |

Relative image resolution within rendered markdown triggers additional file content API requests (one per image). These count against the user's normal rate limit. The web UI should batch/deduplicate image requests and cache resolved images for the session duration.

### Data Privacy & Security

- **XSS prevention**: All rendered HTML sanitized via allowlist approach. `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, event handlers, and `javascript:` URLs stripped before DOM insertion.
- **SVG in markdown images**: Rendered as `<img src="data:image/svg+xml;base64,...">` (sandboxed, no script execution).
- **External image loading**: External images loaded by default (consistent with GitHub). Web UI shows indicator for external content source. User preference "Block external images in markdown" available.
- **Link target safety**: All external links open with `target="_blank"` and `rel="noopener noreferrer"`.
- **Path traversal in relative links**: Resolution clamps to repository root; links above root do not escape.
- **Content not logged**: Raw markdown content must not appear in server or client logs.
- **Math rendering (KaTeX)**: Safe renderer; 500ms timeout per expression; timed-out expressions show raw LaTeX.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `MarkdownPreviewViewed` | Markdown file rendered in preview mode | `owner`, `repo`, `change_id`, `file_path`, `size_bytes`, `line_count`, `client` (web/tui/cli), `render_time_ms`, `has_frontmatter`, `has_math`, `has_tables`, `has_code_blocks`, `image_count`, `relative_link_count` |
| `MarkdownSourceViewed` | User switches to source view on a markdown file | `owner`, `repo`, `change_id`, `file_path`, `client`, `time_in_rendered_ms` |
| `MarkdownToggled` | User toggles between rendered/source | `owner`, `repo`, `file_path`, `from_view`, `to_view`, `client` |
| `MarkdownLinkClicked` | User clicks a link in rendered markdown | `owner`, `repo`, `file_path`, `link_type` (relative/absolute/fragment/image), `target_path`, `client` |
| `MarkdownOutlineUsed` | User uses the table of contents | `owner`, `repo`, `file_path`, `heading_level`, `heading_index`, `total_headings` |
| `MarkdownCodeBlockCopied` | User copies a code block from rendered view | `owner`, `repo`, `file_path`, `code_language`, `block_size_bytes` |
| `MarkdownRenderFallback` | File too large to render; fell back to source | `owner`, `repo`, `file_path`, `size_bytes`, `reason` (size_limit/render_timeout/render_error) |
| `MarkdownPreviewInDiff` | User views rendered preview in landing request diff | `owner`, `repo`, `landing_id`, `file_path`, `change_type` (added/modified/deleted) |
| `MarkdownRenderedCLI` | User uses `--rendered` flag in CLI | `owner`, `repo`, `file_path`, `size_bytes`, `render_time_ms` |
| `MarkdownExternalImageLoaded` | External image loaded in rendered markdown | `owner`, `repo`, `file_path`, `image_host`, `blocked` |

### Success Indicators

| Metric | Definition | Target |
|--------|-----------|--------|
| Markdown preview adoption | % of markdown file views using rendered mode (vs source) | > 70% on web |
| Rendered view dwell time | Median time spent in rendered view per file | > 15s |
| Source toggle rate | % of markdown preview sessions where user toggles to source | < 40% |
| Link click rate | % of rendered previews where a relative link is clicked | > 10% |
| Outline usage rate | % of rendered previews where outline is opened | Tracking |
| Render fallback rate | % of markdown file views that fall back to source due to size/error | < 2% |
| Code block copy rate | % of rendered previews where a code block is copied | Tracking |
| Diff preview usage | % of markdown diffs in landing requests where preview tab is viewed | > 25% |

## Observability

### Logging

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Markdown file detected | `debug` | `file_path`, `size_bytes`, `has_frontmatter` | Lightweight detection log |
| Markdown render initiated (client) | `debug` | `file_path`, `size_bytes`, `client` | Client-side log (web analytics) |
| Markdown render completed (client) | `info` | `file_path`, `size_bytes`, `render_time_ms`, `output_size_bytes`, `client` | Track rendering performance |
| Markdown render fallback (size) | `info` | `file_path`, `size_bytes`, `max_render_size`, `client` | Expected for large files |
| Markdown render fallback (timeout) | `warn` | `file_path`, `size_bytes`, `timeout_ms`, `client` | May indicate pathological content |
| Markdown render error | `error` | `file_path`, `size_bytes`, `error_message`, `client` | Parser or DOM error |
| Markdown sanitization stripped content | `info` | `file_path`, `stripped_elements`, `stripped_count`, `owner`, `repo` | Security-relevant |
| Markdown relative link resolved | `debug` | `file_path`, `raw_link`, `resolved_path` | Link resolution debugging |
| Markdown relative link above root | `warn` | `file_path`, `raw_link`, `owner`, `repo` | Path traversal attempt in markdown |
| Markdown external image loaded | `info` | `file_path`, `image_host`, `owner`, `repo` | Tracking external references |
| Markdown image resolution failed | `warn` | `file_path`, `image_path`, `error`, `owner`, `repo` | Missing referenced images |
| Math expression render timeout | `warn` | `file_path`, `expression_index`, `timeout_ms`, `client` | Pathological LaTeX |
| CLI `--rendered` output generated | `info` | `file_path`, `size_bytes`, `render_time_ms` | CLI rendering performance |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_markdown_preview_requests_total` | Counter | `client`, `view_mode` (rendered/source), `status` (success/fallback/error) | Total markdown preview interactions |
| `codeplane_markdown_render_duration_seconds` | Histogram | `client` | Client-side rendering time (buckets: 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2s, 5s) |
| `codeplane_markdown_render_size_bytes` | Histogram | `client` | Input markdown size for render attempts |
| `codeplane_markdown_render_output_bytes` | Histogram | `client` | Output HTML size after rendering |
| `codeplane_markdown_sanitization_strips_total` | Counter | `element_type` | HTML elements stripped by sanitizer |
| `codeplane_markdown_relative_links_resolved_total` | Counter | `link_type` (file/image/fragment) | Relative link resolutions |
| `codeplane_markdown_external_images_total` | Counter | `blocked` | External image loads (blocked vs allowed) |
| `codeplane_markdown_render_fallbacks_total` | Counter | `reason` (size_limit/timeout/error) | Rendering fallbacks |
| `codeplane_markdown_math_render_timeouts_total` | Counter | | KaTeX render timeouts |
| `codeplane_markdown_code_block_highlight_duration_seconds` | Histogram | `language` | Syntax highlighting time for code blocks within markdown |
| `codeplane_markdown_toggle_total` | Counter | `from_view`, `to_view`, `client` | View mode toggles |

### Alerts & Runbooks

**Alert 1: High Markdown Render Error Rate**
- Condition: `rate(codeplane_markdown_preview_requests_total{status="error"}[5m]) / rate(codeplane_markdown_preview_requests_total[5m]) > 0.05`
- Severity: `warning`
- Runbook: (1) Check client-side error logs for `Markdown render error` entries — the `error_message` field shows the parser failure. (2) If the error is format-specific (e.g., always fails on tables), check markdown parser library version for known bugs. (3) If size-related, check whether 1 MB render limit is being enforced — files slightly under 1 MB with complex content may still cause issues. (4) If browser-specific, check browser distribution in analytics. (5) If repo-specific, inspect the markdown files for unusual syntax or encoding.

**Alert 2: High Sanitization Strip Rate**
- Condition: `rate(codeplane_markdown_sanitization_strips_total[1h]) > 100`
- Severity: `warning`
- Runbook: (1) A burst of sanitization events may indicate XSS testing. (2) Check which `element_type` is being stripped — `script` is highest concern. (3) Cross-reference with `owner`/`repo` from structured logs. (4) If `script` tags stripped frequently from a single repo, review repository contents. (5) Verify sanitizer is functioning correctly. (6) Not necessarily an incident — many legitimate markdown files contain raw HTML.

**Alert 3: Markdown Render P95 Latency > 2 seconds**
- Condition: `histogram_quantile(0.95, rate(codeplane_markdown_render_duration_seconds_bucket[5m])) > 2`
- Severity: `warning`
- Runbook: (1) Check `codeplane_markdown_render_size_bytes` — large files naturally take longer. (2) Check `codeplane_markdown_code_block_highlight_duration_seconds` — syntax highlighting of many/large code blocks is most common cause. (3) Check `codeplane_markdown_math_render_timeouts_total` — complex LaTeX. (4) Check for parser library performance regression. (5) Consider reducing render size limit. (6) Check browser memory pressure.

**Alert 4: Markdown Render Fallback Rate > 5%**
- Condition: `rate(codeplane_markdown_render_fallbacks_total[1h]) / rate(codeplane_markdown_preview_requests_total[1h]) > 0.05`
- Severity: `info`
- Runbook: (1) Check `reason` label — `size_limit` fallbacks expected; `error`/`timeout` concerning. (2) If mostly `size_limit`, informational — large markdown common in auto-generated docs. (3) If `timeout` increasing, investigate per Alert 3. (4) If `error` increasing, investigate per Alert 1.

### Error Cases & Failure Modes

| Error Case | Detection | Impact | Mitigation |
|------------|-----------|--------|------------|
| Markdown parser crash | Uncaught exception | Single file fails | Error boundary; fall back to source |
| Markdown too large to render | Size check | Falls back to source | Banner explaining limit |
| Malformed markdown (unclosed fences) | Parser handles gracefully | May render partially | Fault-tolerant parsers |
| Circular image references | Self-reference detection | Infinite fetch loop | Max 1 fetch per unique path |
| KaTeX expression timeout | 500ms timer | Single expression raw | Other content renders normally |
| Syntax highlighting timeout | Large code blocks | No highlighting | Truncate at 1,000 lines |
| Sanitizer strips required content | Overly aggressive allowlist | Valid HTML disappears | Log stripped elements; tunable allowlist |
| Relative link resolution failure | Path normalization error | Link broken | Fall back to raw href; log error |
| External image host unreachable | Network timeout | Broken image | Show alt text placeholder |
| Browser memory exhaustion | Very large DOM | Tab crash | 2 MB HTML output limit |

## Verification

### API Integration Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `API-MD-001` | GET a known `.md` file | `200`, `language: "markdown"`, `is_markdown: true`, content is raw markdown |
| `API-MD-002` | GET a `.markdown` extension file | `200`, `language: "markdown"`, `is_markdown: true` |
| `API-MD-003` | GET a non-markdown file (`.ts`) | `200`, `is_markdown: false` |
| `API-MD-004` | GET a markdown file with `?encoding=base64` | `200`, content is valid base64 that decodes to markdown |
| `API-MD-005` | GET markdown file with `Accept: application/octet-stream` | `200`, raw bytes, `Content-Type: application/octet-stream` |
| `API-MD-006` | GET empty markdown file (0 bytes) | `200`, `content: ""`, `size: 0`, `line_count: 0`, `is_markdown: true` |
| `API-MD-007` | GET markdown file at exactly 5 MB | `200`, `is_truncated: false`, `is_markdown: true` |
| `API-MD-008` | GET markdown file at 5 MB + 1 byte | `200`, `is_truncated: true`, `is_markdown: true` |
| `API-MD-009` | GET markdown file at exactly 1 MB | `200`, `is_markdown: true`, content returned (render limit is client-side) |
| `API-MD-010` | GET markdown file with YAML frontmatter | `200`, content includes frontmatter as raw text |
| `API-MD-011` | GET markdown file with Unicode content (CJK, emoji) | `200`, content correctly encoded |
| `API-MD-012` | GET markdown file with Windows line endings | `200`, `\r\n` preserved in content |
| `API-MD-013` | GET markdown file with BOM | `200`, content includes BOM bytes |
| `API-MD-014` | Private repo, anonymous request | `401` |
| `API-MD-015` | Private repo, authorized read | `200`, full content |
| `API-MD-016` | Change-scoped markdown file | `200`, `is_markdown: true` with change context |

### CLI Integration Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `CLI-MD-001` | `change cat @ README.md` (default) | Exit 0, stdout is raw markdown |
| `CLI-MD-002` | `change cat @ README.md --json` | Exit 0, JSON with `is_markdown: true`, `language: "markdown"` |
| `CLI-MD-003` | `change cat @ README.md --rendered` | Exit 0, stdout contains ANSI escape codes, bold headings |
| `CLI-MD-004` | `change cat @ README.md --rendered | cat` | Exit 0, ANSI codes present |
| `CLI-MD-005` | `change cat @ README.md --info` | Exit 0, includes "Language: markdown", "Markdown: Yes" |
| `CLI-MD-006` | `change cat @ README.md --rendered --json` | Exit 1, mutually exclusive error |
| `CLI-MD-007` | `change cat @ main.ts --rendered` | Exit 1, "not a markdown file" error |
| `CLI-MD-008` | `change cat @ README.md --rendered -R owner/repo` | Exit 0, fetches remote and renders |
| `CLI-MD-009` | `change cat @ large-file.md --rendered` (>1 MB) | Exit 0, renders with truncation notice or raw output with warning |
| `CLI-MD-010` | `change cat @ README.md | wc -l` | Exit 0, line count matches `--json` line_count |

### E2E Playwright Tests (Web UI)

| Test ID | Description | Expected |
|---------|-------------|----------|
| `E2E-MD-001` | Click `.md` file in Code Explorer | Rendered markdown displays with formatted headings |
| `E2E-MD-002` | MARKDOWN badge in file header | Badge visible with correct styling |
| `E2E-MD-003` | Click `Source` toggle | Raw markdown with syntax highlighting and line numbers |
| `E2E-MD-004` | Click `Rendered` toggle | Returns to formatted view |
| `E2E-MD-005` | Toggle state persists across file navigation | Another `.md` file matches last toggle state |
| `E2E-MD-006` | Headings hierarchy | h1 > h2 > h3 visually distinct |
| `E2E-MD-007` | Fenced code block with language | Syntax-highlighted with language label |
| `E2E-MD-008` | Code block copy button | Clipboard contains code block content |
| `E2E-MD-009` | Table rendering | Headers, alignment, alternating rows |
| `E2E-MD-010` | Task list | Non-interactive checkboxes displayed |
| `E2E-MD-011` | Blockquote | Left border and muted text |
| `E2E-MD-012` | Inline code | Monospace with background |
| `E2E-MD-013` | Bold, italic, strikethrough | Correct formatting |
| `E2E-MD-014` | Ordered and unordered lists | Correct numbering and bullets |
| `E2E-MD-015` | Horizontal rule | Visible divider |
| `E2E-MD-016` | Image from relative path | Loaded from file content API |
| `E2E-MD-017` | Failed image load | Alt text in placeholder |
| `E2E-MD-018` | Relative link to `.md` file | Navigates in Code Explorer |
| `E2E-MD-019` | Relative link to `.ts` file | Navigates to text preview |
| `E2E-MD-020` | Absolute external link | Opens in new tab |
| `E2E-MD-021` | Fragment link (`#heading`) | Smooth-scrolls to heading |
| `E2E-MD-022` | Heading anchor link | Hover shows `#`; click copies fragment URL |
| `E2E-MD-023` | `<details><summary>` block | Collapsible section |
| `E2E-MD-024` | YAML frontmatter hidden in rendered | Not visible |
| `E2E-MD-025` | YAML frontmatter visible in source | Shown with YAML highlighting |
| `E2E-MD-026` | Math expression `$E=mc^2$` | Inline math via KaTeX |
| `E2E-MD-027` | Display math `$$...$$` | Block math centered |
| `E2E-MD-028` | Emoji shortcode `:rocket:` | Renders as 🚀 |
| `E2E-MD-029` | Outline/TOC toggle | Heading list, clickable navigation |
| `E2E-MD-030` | Press `e` key | Toggles to source view |
| `E2E-MD-031` | Markdown >1 MB | "Too large" banner; source shown |
| `E2E-MD-032` | `<script>` tag | Not executed, sanitized |
| `E2E-MD-033` | `javascript:` link | Stripped or plain text |
| `E2E-MD-034` | `<img onerror="alert(1)">` | Event handler stripped |
| `E2E-MD-035` | Empty markdown file | "Empty file" message |
| `E2E-MD-036` | Whitespace-only markdown | "No visible content" indicator |
| `E2E-MD-037` | Switch bookmark | Re-renders for new change |
| `E2E-MD-038` | Deep link to markdown file URL | Rendered view loads |
| `E2E-MD-039` | Private repo, unauthenticated | Redirect to login |
| `E2E-MD-040` | Landing diff: markdown added | Diff + Preview tab |
| `E2E-MD-041` | Landing diff: click Preview | Rendered preview of new version |
| `E2E-MD-042` | Landing diff: markdown deleted | Preview shows "File deleted" |
| `E2E-MD-043` | Landing diff: markdown modified | Rendered new version with banner |
| `E2E-MD-044` | Wide table (100+ columns) | Horizontal scroll, no layout break |
| `E2E-MD-045` | Table with 500+ rows | Truncated with banner |
| `E2E-MD-046` | Code block 1000+ lines | Highlighted and scrollable |
| `E2E-MD-047` | Relative link above repo root | Clamps to root |
| `E2E-MD-048` | Markdown at exactly 1 MB | Rendered view activates |
| `E2E-MD-049` | Markdown at 1 MB + 1 byte | Source with "too large" banner |
| `E2E-MD-050` | BOM character | Stripped; renders normally |

### TUI Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `TUI-MD-001` | Select `.md` file | Rendered markdown with formatted headings, bold, lists |
| `TUI-MD-002` | MARKDOWN badge in header | Badge visible |
| `TUI-MD-003` | Press `Tab` | Toggles to source view |
| `TUI-MD-004` | Press `Tab` again | Returns to rendered view |
| `TUI-MD-005` | Rendered: headings | Bold, colored, distinct hierarchy |
| `TUI-MD-006` | Rendered: code block | Bordered with syntax highlighting |
| `TUI-MD-007` | Rendered: blockquote | Left `│` border |
| `TUI-MD-008` | Rendered: table | ASCII-bordered with alignment |
| `TUI-MD-009` | Rendered: task list | `[x]`/`[ ]` rendered |
| `TUI-MD-010` | Rendered: inline code | Highlighted background |
| `TUI-MD-011` | Rendered: image reference | `[image: alt text]` with URL |
| `TUI-MD-012` | Rendered: link | Underlined text |
| `TUI-MD-013` | `j`/`k` scroll | Content scrolls |
| `TUI-MD-014` | `/` search in rendered | Searches rendered text |
| `TUI-MD-015` | `/` search in source | Searches raw markdown |
| `TUI-MD-016` | `y` copy path | Path copied |
| `TUI-MD-017` | `Y` copy content | Raw markdown copied |
| `TUI-MD-018` | Large markdown (>1 MB) | Source view with banner |
| `TUI-MD-019` | Empty markdown | "Empty file" message |
| `TUI-MD-020` | Responsive 80×24 | Content wraps correctly |
| `TUI-MD-021` | Responsive 120×40 | Full-width rendering |
| `TUI-MD-022` | Rapid toggle rendered↔source | No flicker or state corruption |
