# TUI_DIFF_SYNTAX_HIGHLIGHT

Specification for TUI_DIFF_SYNTAX_HIGHLIGHT.

## High-Level User POV

When a developer opens the diff viewer in the Codeplane TUI, every changed file renders with language-aware syntax highlighting. Keywords, strings, comments, function names, types, operators, and other syntactic elements each appear in distinct colors that match the TUI's dark-theme palette. The highlighting works identically in both unified and split view modes. It coexists with diff-specific coloring — addition lines still have their green background (ANSI 22) and deletion lines still have their red background (ANSI 52), but the code text within those lines is further colorized by syntactic role. Context lines (unchanged lines surrounding a hunk) also receive full syntax highlighting against the default terminal background.

The language for each file is determined automatically. The API response includes a `language` field for each file in the diff. If the language is present, it is mapped to a Tree-sitter parser filetype and passed as the `filetype` prop to OpenTUI's `<diff>` component, which delegates to the `CodeRenderable` layer for highlighting. If the language field is missing or null, the TUI falls back to detecting the language from the file extension using the `pathToFiletype()` utility from OpenTUI's resolve-ft module, which covers 100+ file extensions and special basenames (Dockerfile, Makefile, .bashrc, etc.). If neither the API language field nor the file path resolves to a known language, the file renders as plain text — diff colors (green/red backgrounds, +/- signs) are still applied, but no syntactic coloring is added. The user sees no error or warning; plain-text fallback is silent and seamless.

Syntax highlighting is performed asynchronously by Tree-sitter via OpenTUI's built-in highlighting pipeline. When a diff file first renders, the code content may briefly appear without syntax colors while the Tree-sitter worker processes the file. Once highlighting completes, the styled text is applied in-place without any visible flicker or layout shift. The `<diff>` component handles this transition internally. For large files, highlighting may take a noticeable moment, but the diff is always immediately scrollable and navigable — highlighting does not block interaction.

The syntax color palette is defined as a `SyntaxStyle` instance using the Codeplane dark theme. It maps Tree-sitter highlight groups to RGBA foreground colors, with optional attributes (bold, italic, dim). The palette covers these categories: `keyword` (pink-red, bold), `string` (light blue), `comment` (gray, italic), `number` and `boolean` (cyan-blue), `function` and `function.call` (purple), `constructor` and `type` (orange), `operator` (pink-red), `variable` (light gray), `property` (cyan-blue), `bracket` and `punctuation` (white-gray), and `default` (light gray). These colors are selected for strong contrast against both the default dark background and the green/red diff backgrounds, ensuring that syntax elements remain readable on every line type (addition, deletion, or context).

The `SyntaxStyle` instance is created once at the diff screen's mount and memoized for the lifetime of the screen. It is shared across all `<diff>` component instances rendered for each file in the diff. The style object is not recreated on view toggle, file navigation, or whitespace toggle — it remains stable to avoid unnecessary Tree-sitter re-processing.

On terminals limited to ANSI 256 colors (no truecolor support), the syntax highlighting colors are automatically downsampled by OpenTUI's color pipeline to the nearest 256-color palette indices. The visual hierarchy is preserved even if individual shades shift slightly. On 16-color terminals, syntax highlighting degrades to a minimal scheme using the basic ANSI color set (red, green, blue, cyan, yellow, magenta, white). Keywords and operators share the red/magenta slot, strings use green, comments use the dim attribute, and most other tokens fall back to the default foreground. The highlighting is always additive — it never makes text less readable than plain text.

The user has no direct toggle to enable or disable syntax highlighting. It is always on when a language can be detected. The feature is transparent: the developer simply sees colored code in the diff and does not need to configure anything.

## Acceptance Criteria

### Definition of Done

- [ ] The `<diff>` component receives a `filetype` prop derived from the API response's `language` field for each file in the diff
- [ ] When the API `language` field is null or missing, the TUI falls back to `pathToFiletype(file.path)` from `@opentui/core`'s resolve-ft module
- [ ] When neither API language nor file path resolves to a known filetype, the file renders as plain text with no syntax highlighting
- [ ] A single `SyntaxStyle` instance is created via `SyntaxStyle.fromStyles()` at diff screen mount and shared across all `<diff>` components
- [ ] The `SyntaxStyle` instance is memoized via `useMemo` and not recreated on view toggle, file navigation, whitespace toggle, or resize
- [ ] The `syntaxStyle` prop is passed to every `<diff>` component in the diff file list
- [ ] Syntax highlighting renders in both unified and split view modes
- [ ] Syntax highlighting coexists with diff coloring: addition lines show syntax colors over green background, deletion lines show syntax colors over red background, context lines show syntax colors over default background
- [ ] The syntax color palette covers at minimum: `keyword`, `keyword.import`, `string`, `comment`, `number`, `boolean`, `constant`, `function`, `function.call`, `constructor`, `type`, `operator`, `variable`, `property`, `bracket`, `punctuation`, `default`
- [ ] Each syntax token color is selected for readable contrast against the dark terminal background and against both diff addition (ANSI 22 / `#1A4D1A`) and deletion (ANSI 52 / `#4D1A1A`) backgrounds
- [ ] Highlighting is asynchronous and non-blocking: the diff is scrollable and navigable before highlighting completes
- [ ] Highlighting applies without visible layout shift — line widths and positions do not change when syntax colors arrive
- [ ] The `SyntaxStyle` is destroyed (`.destroy()`) when the diff screen unmounts to free native resources
- [ ] Truecolor terminals display the full 24-bit syntax color palette
- [ ] ANSI 256 terminals display downsampled syntax colors via OpenTUI's automatic color pipeline
- [ ] 16-color terminals display a reduced syntax scheme using basic ANSI colors with no invisible or unreadable text
- [ ] Files with `is_binary: true` skip syntax highlighting entirely and show "Binary file changed"
- [ ] Files exceeding 1MB skip syntax highlighting and show "File too large to display"
- [ ] Collapsed hunks do not trigger syntax highlighting for their hidden content (highlighting only applies to visible/expanded lines)

### Edge Cases

- [ ] A diff containing files in 10+ different languages highlights each file independently with the correct language parser
- [ ] A file with a double extension (e.g., `config.test.ts`) resolves correctly to `typescript` via the file extension map
- [ ] A file with no extension and no basename match (e.g., `LICENSE`) renders as plain text without error
- [ ] A file whose API `language` field is an empty string `""` falls back to path-based detection, not empty-language parsing
- [ ] A file whose API `language` field is an unrecognized string (e.g., `"brainfuck"`) falls back to plain text rendering without error or warning
- [ ] Syntax highlighting on a file with 0 additions and 0 deletions (context-only change from hunk expansion) still applies correctly
- [ ] Toggling between unified and split view does not trigger re-highlighting — the cached Tree-sitter output is reused
- [ ] Navigating away from a file (via `]`/`[`) and back does not re-trigger highlighting if the Tree-sitter result is cached
- [ ] Terminal resize does not reset or restart syntax highlighting — the styled text is preserved through relayout
- [ ] A diff patch containing ANSI escape codes in the literal source text does not interfere with syntax highlighting — the `<diff>` component escapes raw ANSI before applying syntax styles
- [ ] Rapid file navigation (`]` pressed 10 times quickly) does not queue 10 highlighting operations — only the final visible file triggers highlighting
- [ ] When Tree-sitter worker fails or times out for a specific file, that file degrades to plain text rendering while other files continue to highlight normally
- [ ] Hunk headers (`@@ ... @@`) are rendered in cyan (ANSI 37) and are not subject to syntax highlighting
- [ ] The `+`/`-` sign characters in the diff gutter are colored by diff sign colors, not by syntax highlighting
- [ ] Expanding a previously collapsed hunk triggers syntax highlighting for the newly visible lines

### Boundary Constraints

- [ ] `SyntaxStyle` supports a maximum style map of 50 registered names; the current 17-token palette is well within this limit
- [ ] File paths passed to `pathToFiletype()` are capped at 4,096 characters; longer paths skip language detection and default to plain text
- [ ] The `filetype` string passed to the `<diff>` component must be a non-empty string or `undefined`; null is converted to `undefined` before passing
- [ ] Syntax color hex values must be valid 6-character hex strings (e.g., `#FF7B72`); invalid values fall back to magenta per OpenTUI's `hexToRgb` behavior
- [ ] RGBA objects for syntax tokens are created once (via `parseColor`) and referenced by identity — no new allocations per render cycle
- [ ] The Tree-sitter WASM parser files are loaded lazily; only parsers for languages present in the current diff are loaded into memory
- [ ] Maximum concurrent Tree-sitter highlighting operations: bounded by the number of expanded, visible files (typically 1-5 at a time due to scrollbox virtualization)
- [ ] Syntax highlighting for a single file must complete within 5 seconds; files that exceed this timeout degrade to plain text with a debug-level log entry

## Design

### Syntax Color Palette

The diff viewer uses a single dark-theme syntax style defined as a `SyntaxStyle` instance. The palette is designed for contrast against the three diff background colors: default dark (`#0D1117` / transparent), addition green (`#1A4D1A`), and deletion red (`#4D1A1A`).

| Token | Hex | ANSI 256 | ANSI 16 | Attributes | Purpose |
|-------|-----|----------|---------|------------|--------|
| `keyword` | `#FF7B72` | 209 | Red | bold | `if`, `else`, `return`, `const`, `let`, `class`, `import` |
| `keyword.import` | `#FF7B72` | 209 | Red | bold | `import`, `from`, `export` |
| `string` | `#A5D6FF` | 153 | Cyan | — | String literals, template strings |
| `comment` | `#8B949E` | 248 | White (dim) | italic | Line comments, block comments, doc comments |
| `number` | `#79C0FF` | 117 | Cyan | — | Numeric literals |
| `boolean` | `#79C0FF` | 117 | Cyan | — | `true`, `false` |
| `constant` | `#79C0FF` | 117 | Cyan | — | Named constants, enum members |
| `function` | `#D2A8FF` | 183 | Magenta | — | Function declarations |
| `function.call` | `#D2A8FF` | 183 | Magenta | — | Function invocations |
| `constructor` | `#FFA657` | 215 | Yellow | — | Constructor calls, class instantiation |
| `type` | `#FFA657` | 215 | Yellow | — | Type annotations, interface names |
| `operator` | `#FF7B72` | 209 | Red | — | `=`, `+`, `-`, `===`, `=>` |
| `variable` | `#E6EDF3` | 255 | White | — | Variable references |
| `property` | `#79C0FF` | 117 | Cyan | — | Object property access |
| `bracket` | `#F0F6FC` | 255 | White | — | `(`, `)`, `[`, `]`, `{`, `}` |
| `punctuation` | `#F0F6FC` | 255 | White | — | `,`, `;`, `:`, `.` |
| `default` | `#E6EDF3` | 255 | White | — | Fallback for unmatched tokens |

### Component Integration

The syntax highlighting integrates with the existing diff screen component structure defined in TUI_DIFF_SCREEN:

```tsx
// At diff screen component level
const syntaxStyle = useMemo(() => {
  return SyntaxStyle.fromStyles({
    keyword: { fg: parseColor("#FF7B72"), bold: true },
    "keyword.import": { fg: parseColor("#FF7B72"), bold: true },
    string: { fg: parseColor("#A5D6FF") },
    comment: { fg: parseColor("#8B949E"), italic: true },
    number: { fg: parseColor("#79C0FF") },
    boolean: { fg: parseColor("#79C0FF") },
    constant: { fg: parseColor("#79C0FF") },
    function: { fg: parseColor("#D2A8FF") },
    "function.call": { fg: parseColor("#D2A8FF") },
    constructor: { fg: parseColor("#FFA657") },
    type: { fg: parseColor("#FFA657") },
    operator: { fg: parseColor("#FF7B72") },
    variable: { fg: parseColor("#E6EDF3") },
    property: { fg: parseColor("#79C0FF") },
    bracket: { fg: parseColor("#F0F6FC") },
    punctuation: { fg: parseColor("#F0F6FC") },
    default: { fg: parseColor("#E6EDF3") },
  })
}, [])

// Cleanup on unmount
useEffect(() => {
  return () => syntaxStyle.destroy()
}, [syntaxStyle])
```

Each `<diff>` component receives `syntaxStyle` and `filetype`:

```tsx
<diff
  diff={file.patch}
  view={viewMode}
  filetype={resolveFiletype(file.language, file.path)}
  syntaxStyle={syntaxStyle}
  showLineNumbers={true}
  syncScroll={viewMode === "split"}
  addedBg={theme.diffAddedBg}
  removedBg={theme.diffRemovedBg}
  addedSignColor={theme.diffAddedText}
  removedSignColor={theme.diffRemovedText}
  lineNumberFg={theme.muted}
/>
```

### Language Resolution

```tsx
function resolveFiletype(
  apiLanguage: string | null | undefined,
  filePath: string
): string | undefined {
  // 1. Prefer explicit API language field
  if (apiLanguage && apiLanguage.trim().length > 0) {
    return apiLanguage.trim().toLowerCase()
  }
  // 2. Fall back to path-based detection
  if (filePath && filePath.length <= 4096) {
    return pathToFiletype(filePath)
  }
  // 3. No language detected — plain text
  return undefined
}
```

### Keybindings

This feature does not introduce any new keybindings. Syntax highlighting is always-on and requires no user interaction. All existing diff screen keybindings continue to function identically:

| Key | Interaction with syntax highlighting |
|-----|--------------------------------------|
| `t` | Toggles view mode; highlighting persists without re-processing |
| `w` | Toggles whitespace; re-fetched diff re-highlights from cache if same content |
| `]` / `[` | Navigates files; each file highlights with its own filetype |
| `z` / `Z` | Collapses hunks; hidden lines skip highlighting |
| `x` / `X` | Expands hunks; newly visible lines trigger highlighting |
| `Ctrl+B` | Toggles sidebar; no effect on highlighting |
| `j` / `k` | Scrolls content; highlighting is scroll-independent |

### Responsive Behavior

| Terminal size | Syntax highlighting behavior |
|---------------|------------------------------|
| 80×24 (minimum) | Full syntax highlighting active. Unified mode only |
| 120×40 (standard) | Full syntax highlighting in both unified and split modes |
| 200×60+ (large) | Full syntax highlighting with wider gutters and more context |
| Resize during view | Colors preserved through relayout. No re-highlighting triggered |
| 16-color terminal | Degraded palette: keywords=red, strings=green, comments=dim white, functions=magenta, types=yellow |
| 256-color terminal | Near-full-fidelity palette with automatic downsampling |
| Truecolor terminal | Full 24-bit palette as defined in the token table |

### Data Hooks Consumed

| Hook/Utility | Source | Purpose |
|-------------|--------|--------|
| `useChangeDiff(owner, repo, change_id)` | `@codeplane/ui-core` | Provides `language` field per file in the diff response |
| `useLandingDiff(owner, repo, number, opts)` | `@codeplane/ui-core` | Provides `language` field per file in the landing diff response |
| `pathToFiletype(path)` | `@opentui/core` | Fallback language detection from file path/extension |
| `SyntaxStyle.fromStyles(styles)` | `@opentui/core` | Creates the native syntax style object for Tree-sitter highlighting |
| `parseColor(hex)` | `@opentui/core` | Converts hex color strings to RGBA objects for the style definition |

## Permissions & Security

### Authorization

Syntax highlighting is a purely client-side rendering feature. It requires no additional permissions beyond those already required to view the diff:

| Action | Required role | Notes |
|--------|--------------|-------|
| View diff with syntax highlighting | Repository read access | Same as viewing the diff without highlighting |
| View private repo diff with highlighting | Repository member or collaborator | Syntax highlighting adds no additional permission check |

The `language` field in the API response is a read-only property derived server-side from the file path. It cannot be manipulated by the client to affect authorization.

### Token-based Authentication

- Syntax highlighting does not make any additional API requests beyond the existing diff fetch
- No authentication change is required to enable or use syntax highlighting
- The feature is entirely offline-capable once the diff data is loaded — Tree-sitter operates locally

### Rate Limiting

- Syntax highlighting does not generate any API calls and therefore has no rate limiting impact
- The re-fetch triggered by whitespace toggle (`w`) may return different `language` values (unlikely), but this is already covered by the existing diff fetch rate limiting (5,000 requests/hour, 300ms debounce)

### Input Sanitization

- The `language` field from the API response is used as a filetype string passed to Tree-sitter. Tree-sitter's parser lookup is a map-based lookup; unrecognized filetypes result in no parser being loaded, not code execution
- File content within the diff patch is parsed by Tree-sitter's WASM-sandboxed parser. Tree-sitter parsers cannot execute arbitrary code — they are deterministic finite-state machines compiled to WASM
- The `SyntaxStyle` style definitions use only `RGBA` color values and text attributes (bold/italic/underline/dim). No style definition can trigger code execution or terminal escape injection

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.diff.syntax_highlight.applied` | Syntax highlighting completes for a file | `filetype`, `file_path`, `source` (`api` \| `path_fallback`), `duration_ms`, `line_count` |
| `tui.diff.syntax_highlight.fallback_plain` | File renders as plain text (no language detected) | `file_path`, `api_language` (null \| empty \| unrecognized), `has_extension` (boolean) |
| `tui.diff.syntax_highlight.degraded` | Tree-sitter timeout or error for a file | `filetype`, `file_path`, `error_type` (`timeout` \| `parse_error` \| `worker_crash`), `line_count` |
| `tui.diff.syntax_highlight.color_tier` | Diff screen opened (once per session) | `color_tier` (`truecolor` \| `256` \| `16`), `terminal_type` |

### Common Properties (all events)

| Property | Description |
|----------|-------------|
| `session_id` | Unique TUI session identifier |
| `terminal_width` | Current terminal column count |
| `terminal_height` | Current terminal row count |
| `timestamp` | ISO 8601 event timestamp |
| `user_id` | Authenticated user identifier |
| `diff_source` | `change` or `landing` — context of the diff being viewed |

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Syntax highlight coverage | > 85% of files | Percentage of diff files that receive syntax highlighting (have a detected language) |
| Highlight completion time (P50) | < 200ms | Time from file render to syntax colors appearing |
| Highlight completion time (P95) | < 1s | Acceptable upper bound for large files |
| Plain-text fallback rate | < 15% of files | Percentage of files where no language is detected |
| Highlight degradation rate | < 0.5% of files | Percentage of files where Tree-sitter fails or times out |
| Color tier truecolor adoption | > 70% of sessions | Percentage of TUI sessions using truecolor terminals |

## Observability

### Logging Requirements

| Level | Event | Format | When |
|-------|-------|--------|------|
| `debug` | `diff.syntax.style_created` | `{token_count, style_id}` | SyntaxStyle instance created at screen mount |
| `debug` | `diff.syntax.style_destroyed` | `{style_id}` | SyntaxStyle instance destroyed at screen unmount |
| `debug` | `diff.syntax.highlight_started` | `{file_path, filetype, line_count}` | Tree-sitter highlighting begins for a file |
| `debug` | `diff.syntax.highlight_completed` | `{file_path, filetype, duration_ms, chunk_count}` | Tree-sitter highlighting finishes for a file |
| `debug` | `diff.syntax.language_resolved` | `{file_path, source: "api" \| "path", filetype}` | Language successfully resolved for a file |
| `info` | `diff.syntax.language_unresolved` | `{file_path, api_language}` | No language detected; file renders as plain text |
| `warn` | `diff.syntax.highlight_timeout` | `{file_path, filetype, timeout_ms: 5000, line_count}` | Tree-sitter exceeds 5s timeout for a file |
| `warn` | `diff.syntax.worker_error` | `{file_path, filetype, error_message}` | Tree-sitter worker throws an error for a file |
| `error` | `diff.syntax.style_create_failed` | `{error_message}` | SyntaxStyle.fromStyles() throws during creation |
| `debug` | `diff.syntax.color_tier_detected` | `{tier: "truecolor" \| "256" \| "16", colorterm, term}` | Color capability detected at diff screen init |

### TUI-Specific Error Cases

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| `SyntaxStyle.fromStyles()` throws at mount | Diff renders without syntax highlighting; all files appear as plain text with diff coloring intact | Automatic degradation. Log at `error` level. No user action needed |
| Tree-sitter WASM parser fails to load for a language | That specific file renders as plain text; other files with available parsers highlight normally | Automatic per-file degradation |
| Tree-sitter highlighting times out (>5s) for a large file | The file remains in its pre-highlight state (plain text with diff colors). A debug log is emitted | Automatic. User sees no error. File is still fully readable |
| Terminal resize during active highlighting | Highlighting continues in background. Styled text is applied when ready. No re-trigger needed | Automatic |
| Memory pressure from many highlighted files | Tree-sitter workers process files sequentially, limiting peak memory. Completed highlights are cached as TextChunk arrays, not re-processed | Automatic via sequential processing |
| `parseColor()` receives invalid hex value | OpenTUI falls back to magenta for that token. A warning is logged at startup. Other tokens render correctly | Automatic. One-time issue at style creation |
| File with `language: "typescript"` but content is actually Python | Tree-sitter applies TypeScript grammar rules, producing incorrect but harmless coloring. No crash | No recovery needed. Cosmetic only |
| Rapid view toggles (unified ↔ split) during highlighting | View change does not restart highlighting. The same Tree-sitter output is reused for both view modes | Automatic |

### Failure Modes and Degradation

| Failure | Impact | Degradation |
|---------|--------|-------------|
| All Tree-sitter parsers unavailable | No syntax highlighting on any file | Files render as plain text with diff colors. Fully functional otherwise |
| Single parser unavailable (e.g., TypeScript WASM missing) | No highlighting for files of that language | Affected files render as plain text. Other languages highlight normally |
| SyntaxStyle instance leaked (not destroyed on unmount) | Memory leak over repeated diff screen open/close cycles | Mitigated by React cleanup in useEffect. If leaked, native memory grows but TUI continues to function |
| Syntax colors clash with diff background at 16-color tier | Reduced readability for specific tokens on addition/deletion lines | Acceptable. `+`/`-` signs and diff structure remain clear even if syntax tokens are harder to distinguish |
| `language` field contains XSS-like payload from API | No impact. Value is used as a Tree-sitter filetype lookup key, not rendered or executed | Tree-sitter map lookup returns `undefined`; file renders as plain text |

## Verification

Test file: `e2e/tui/diff.test.ts`

### Snapshot Tests — Syntax Highlighting Visual States

| Test ID | Test name | Description |
|---------|-----------|-------------|
| SNAP-SYN-001 | `renders TypeScript diff with syntax highlighting at 120x40` | Snapshot of a TypeScript file diff showing keywords in pink-red bold, strings in light blue, comments in gray italic, function names in purple, types in orange |
| SNAP-SYN-002 | `renders JavaScript diff with syntax highlighting at 120x40` | Snapshot of a JavaScript file diff with JS-specific tokens highlighted |
| SNAP-SYN-003 | `renders Python diff with syntax highlighting at 120x40` | Snapshot of a Python file diff with Python keywords, decorators, and strings highlighted |
| SNAP-SYN-004 | `renders syntax highlighting on addition lines with green background` | Snapshot verifying syntax colors are visible over the green diff addition background (ANSI 22) |
| SNAP-SYN-005 | `renders syntax highlighting on deletion lines with red background` | Snapshot verifying syntax colors are visible over the red diff deletion background (ANSI 52) |
| SNAP-SYN-006 | `renders syntax highlighting on context lines with default background` | Snapshot verifying syntax colors on unchanged context lines with no diff background |
| SNAP-SYN-007 | `renders plain text for file with unknown language` | Snapshot of a file with no detectable language showing plain text (default foreground) with diff colors intact |
| SNAP-SYN-008 | `renders syntax highlighting in split view at 120x40` | Snapshot of split diff mode with syntax highlighting applied to both old (left) and new (right) panes |
| SNAP-SYN-009 | `renders syntax highlighting in split view at 200x60` | Snapshot of split diff mode at large terminal with full syntax coloring |
| SNAP-SYN-010 | `renders syntax highlighting at 80x24 minimum` | Snapshot at minimum terminal size verifying syntax colors are applied in unified mode |
| SNAP-SYN-011 | `renders multi-language diff with per-file highlighting` | Snapshot of a diff containing a TypeScript file and a Markdown file, each with language-appropriate syntax colors |
| SNAP-SYN-012 | `renders hunk headers in cyan without syntax highlighting` | Snapshot verifying `@@ ... @@` hunk headers render in cyan (ANSI 37) and are not affected by syntax token colors |
| SNAP-SYN-013 | `renders diff signs with diff colors not syntax colors` | Snapshot verifying `+` signs are green (ANSI 34) and `-` signs are red (ANSI 196), independent of syntax highlighting |
| SNAP-SYN-014 | `renders Rust diff with syntax highlighting` | Snapshot of a Rust file diff with lifetime annotations, macros, and trait bounds highlighted |
| SNAP-SYN-015 | `renders Go diff with syntax highlighting` | Snapshot of a Go file diff with goroutine keywords, channel operations, and struct literals highlighted |
| SNAP-SYN-016 | `renders CSS diff with syntax highlighting` | Snapshot of a CSS file diff with selectors, properties, and values highlighted |

### Keyboard Interaction Tests

| Test ID | Test name | Key sequence | Expected state change |
|---------|-----------|-------------|----------------------|
| KEY-SYN-001 | `syntax highlighting persists after view toggle` | `t` (unified → split) | Syntax colors remain applied; no flicker or re-render to plain text during transition |
| KEY-SYN-002 | `syntax highlighting persists after view toggle back` | `t`, `t` (split → unified) | Syntax colors remain applied after round-trip toggle |
| KEY-SYN-003 | `file navigation applies correct filetype` | `]` (from .ts file to .py file) | New file renders with Python syntax highlighting, not TypeScript |
| KEY-SYN-004 | `file navigation back preserves highlighting` | `]`, `[` | Previous file still has syntax highlighting from cache |
| KEY-SYN-005 | `expanding collapsed hunk triggers highlighting` | `z` (collapse), `Enter` (expand) | Newly visible lines render with syntax highlighting |
| KEY-SYN-006 | `whitespace toggle preserves syntax highlighting` | `w` | Re-fetched diff re-highlights files; syntax colors appear on new content |
| KEY-SYN-007 | `sidebar toggle does not affect highlighting` | `Ctrl+B` | Syntax colors remain on diff content regardless of sidebar visibility |
| KEY-SYN-008 | `rapid file navigation settles on correct highlighting` | `]` × 5 (rapid) | Final visible file has correct syntax highlighting for its language |
| KEY-SYN-009 | `scrolling through highlighted diff is smooth` | `j` × 50 (rapid) | Syntax-highlighted content scrolls without stutter or color dropout |
| KEY-SYN-010 | `expanding all hunks highlights all content` | `Z` (collapse all), `x` (expand all) | All expanded hunks show syntax highlighting |

### Responsive Behavior Tests

| Test ID | Test name | Terminal size | Expected behavior |
|---------|-----------|--------------|-------------------|
| RSP-SYN-001 | `syntax highlighting active at 80x24` | 80×24 | Syntax colors applied in unified mode at minimum size |
| RSP-SYN-002 | `syntax highlighting active at 120x40` | 120×40 | Syntax colors applied in both unified and split modes |
| RSP-SYN-003 | `syntax highlighting active at 200x60` | 200×60 | Syntax colors applied with wider gutters and more context |
| RSP-SYN-004 | `resize preserves syntax highlighting` | 120×40 → 80×24 | Syntax colors preserved during shrink; no re-highlighting |
| RSP-SYN-005 | `resize from split to unified preserves highlighting` | 120×40 (split) → 80×24 | Auto-switch to unified mode retains syntax highlighting |
| RSP-SYN-006 | `resize to larger terminal preserves highlighting` | 80×24 → 200×60 | Syntax colors preserved during growth; additional context lines also highlighted |

### Data Integration Tests

| Test ID | Test name | Description |
|---------|-----------|-------------|
| INT-SYN-001 | `API language field used for filetype` | Diff response with `language: "typescript"` produces syntax-highlighted TypeScript |
| INT-SYN-002 | `path fallback when API language is null` | Diff response with `language: null` and file path `src/app.ts` highlights as TypeScript via path detection |
| INT-SYN-003 | `path fallback when API language is empty string` | Diff response with `language: ""` and file path `main.py` highlights as Python |
| INT-SYN-004 | `plain text when language unresolvable` | File `LICENSE` with `language: null` renders as plain text without syntax colors |
| INT-SYN-005 | `unrecognized API language falls back to plain text` | Diff response with `language: "brainfuck"` renders as plain text |
| INT-SYN-006 | `Dockerfile detected by basename` | File `Dockerfile` with `language: null` highlights as dockerfile via basename detection |
| INT-SYN-007 | `Makefile detected by basename` | File `Makefile` with `language: null` highlights as make via basename detection |
| INT-SYN-008 | `double extension resolves correctly` | File `component.test.tsx` resolves to `typescriptreact` |
| INT-SYN-009 | `binary file skips syntax highlighting` | File with `is_binary: true` shows "Binary file changed" with no Tree-sitter invocation |
| INT-SYN-010 | `oversized file skips syntax highlighting` | File with >1MB patch shows "File too large to display" with no Tree-sitter invocation |

### Edge Case Tests

| Test ID | Test name | Description |
|---------|-----------|-------------|
| EDGE-SYN-001 | `syntax highlighting does not block scrolling` | Diff with large TypeScript file (1000+ lines): `j`/`k` navigation works immediately before highlighting completes |
| EDGE-SYN-002 | `highlighting failure for one file does not affect others` | Diff with intentionally broken file + normal TypeScript file: TypeScript file highlights normally |
| EDGE-SYN-003 | `SyntaxStyle cleanup on screen unmount` | Open diff screen, press `q` to close: SyntaxStyle.destroy() called, no native memory leak |
| EDGE-SYN-004 | `re-opening diff screen creates fresh SyntaxStyle` | Open diff, close, re-open: new SyntaxStyle instance created successfully |
| EDGE-SYN-005 | `10+ languages in single diff` | Diff with .ts, .py, .rs, .go, .js, .css, .html, .json, .md, .yaml, .toml files: each highlights with correct grammar |
| EDGE-SYN-006 | `context-only hunk with syntax highlighting` | Expanded context lines (no additions/deletions) show syntax colors on default background |
| EDGE-SYN-007 | `empty file does not trigger highlighting` | Added file with 0 lines shows "Empty file added" with no Tree-sitter invocation |
| EDGE-SYN-008 | `syntax highlighting on renamed file with content changes` | Renamed `.js` → `.ts` file highlights with TypeScript grammar (new path), not JavaScript |
