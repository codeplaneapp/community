# TUI_THEME_AND_COLOR_TOKENS

Specification for TUI_THEME_AND_COLOR_TOKENS.

## High-Level User POV

When a developer launches the Codeplane TUI, every piece of text, border, status indicator, diff highlight, and interactive element renders in colors that are appropriate for their terminal's capabilities. The user never needs to configure anything — the TUI detects whether their terminal supports truecolor (24-bit, as in iTerm2, Ghostty, kitty, WezTerm, Windows Terminal), 256-color mode (xterm-256color, screen-256color, tmux-256color), or basic 16-color ANSI, and automatically selects the best color palette for that environment.

The color system communicates meaning consistently across every screen. Blue always means "focused" or "interactive." Green always means "healthy" or "open." Yellow always means "pending" or "conflicted." Red always means "error" or "closed." Gray always means "secondary" or "metadata." These meanings hold whether the user is looking at an issue list, a workflow run, a diff, a notification badge, or the sync status indicator. The user builds muscle memory around these color signals and can parse screen state at a glance.

Developers who set the `NO_COLOR` environment variable or whose terminal reports `TERM=dumb` see a gracefully degraded experience. Colors fall back to the basic 16-color ANSI palette where possible, and where colors would be meaningless, text-based indicators (like `[ERROR]` prefixes or ASCII markers) replace color-only signals. The TUI remains fully usable without color.

The diff viewer uses a dedicated set of colors — green backgrounds and text for additions, red backgrounds and text for deletions, and cyan for hunk headers — that are distinct from the semantic UI tokens and tuned per color tier for maximum readability. Code in diffs and file previews receives syntax highlighting using a rich palette (keywords, strings, comments, functions, types, operators, etc.) that also adapts to the terminal's color capability.

The user experiences no flicker, no color changes during a session, and no re-detection on terminal resize. Colors are resolved once at startup and remain stable for the lifetime of the TUI session. Every screen — from the error boundary (which renders above the theme system) to the deepest nested modal overlay — uses the same coherent token palette.

## Acceptance Criteria

### Definition of Done

- [ ] All 12 semantic color tokens (primary, success, warning, error, muted, surface, border, diffAddedBg, diffRemovedBg, diffAddedText, diffRemovedText, diffHunkHeader) are defined for all 3 color tiers (truecolor, ansi256, ansi16)
- [ ] The `ThemeProvider` is positioned in the provider stack below `ErrorBoundary` and above all other providers
- [ ] `useTheme()` returns a frozen `ThemeTokens` object with RGBA values appropriate for the detected terminal
- [ ] `useColorTier()` returns the detected `ColorTier` string for tier-aware component behavior
- [ ] Zero hardcoded color hex strings or ANSI codes exist in any TUI component — all colors resolve through the token system or through direct `createTheme()` for components above the ThemeProvider
- [ ] `NO_COLOR` environment variable (any non-empty value) forces ansi16 tier
- [ ] `TERM=dumb` forces ansi16 tier
- [ ] `COLORTERM=truecolor` or `COLORTERM=24bit` selects truecolor tier
- [ ] `TERM` containing `256color` selects ansi256 tier
- [ ] Default (no recognized env signals) falls back to ansi256 tier
- [ ] Theme tokens are allocated once at startup and reused by identity — no per-render RGBA allocation
- [ ] Token objects are `Object.freeze()`-d and readonly — mutation is impossible
- [ ] `statusToToken()` maps all entity states (open, closed, pending, active, running, passed, failed, merged, draft, queued, syncing, conflict, suspended, paused, rejected, disconnected, cancelled, timed_out, stopped, focused, selected, current) to the correct semantic token name
- [ ] Unknown status strings fall back to `"muted"` token
- [ ] `TextAttributes` constants (BOLD, DIM, UNDERLINE, REVERSE) are available for semantic text styling
- [ ] The error boundary renders colors independently of ThemeProvider (uses `detectColorCapability()` + `createTheme()` directly)
- [ ] Terminal resize does not trigger color re-detection or token re-creation
- [ ] Syntax highlighting palettes (diff-syntax.ts) provide 17 syntax tokens × 3 tiers
- [ ] `useDiffSyntaxStyle()` creates a `SyntaxStyle` instance once and destroys it on unmount
- [ ] HeaderBar, StatusBar, ErrorScreen, FullScreenLoading, SkeletonList, OverlayLayer, and ActionButton all consume colors exclusively through `useTheme()`

### Edge Cases

- [ ] `NO_COLOR=1` with `COLORTERM=truecolor` simultaneously set → `NO_COLOR` takes priority (ansi16)
- [ ] `NO_COLOR=` (empty string) → does NOT trigger NO_COLOR behavior (empty is not "set")
- [ ] `TERM=dumb` with `COLORTERM=truecolor` → `TERM=dumb` takes priority (ansi16)
- [ ] `TERM` is unset/empty → falls through to default ansi256
- [ ] `COLORTERM` is unset/empty → does not match truecolor detection
- [ ] `useTheme()` called outside `<ThemeProvider>` → throws descriptive error message
- [ ] `useColorTier()` called outside `<ThemeProvider>` → throws descriptive error message
- [ ] `statusToToken("")` (empty string) → returns "muted"
- [ ] `statusToToken()` with mixed case (`"OPEN"`, `"Closed"`, `"pEnDiNg"`) → case-insensitive, returns correct token
- [ ] ErrorBoundary catches an error before ThemeProvider mounts → error screen still renders with colors
- [ ] Double-fault in error boundary → falls back to stderr text output, no color dependency
- [ ] `createTheme()` called with same tier returns same identity object (singleton)

### Boundary Constraints

- [ ] Status strings passed to `statusToToken()` are trimmed and lowercased; maximum practical length is 64 characters
- [ ] RGBA values are Float32Array-backed with normalized 0.0–1.0 range internally
- [ ] `THEME_TOKEN_COUNT` constant equals exactly 12 (core semantic + diff tokens)
- [ ] `SYNTAX_TOKEN_COUNT` constant equals exactly 17 (syntax highlighting tokens)
- [ ] Token names are a closed set — no dynamic token creation at runtime
- [ ] Maximum number of RGBA objects allocated by the theme system is 36 (12 tokens × 3 tiers)
- [ ] Syntax highlighting allocates an additional maximum of ~50 RGBA objects (17 tokens × 3 tiers, with shared constants reducing actual count)

## Design

### TUI UI

#### Semantic Color Token Mapping

| Token | Purpose | Truecolor (hex) | ANSI 256 (index) | ANSI 16 (name) |
|-------|---------|-----------------|-------------------|----------------|
| `primary` | Focused items, links, active tabs, keybinding labels | #2563EB | 33 (Blue) | Blue |
| `success` | Open issues, passed checks, additions, connected status, merged landings | #16A34A | 34 (Green) | Green |
| `warning` | Pending states, conflicts, syncing status, draft landings, suspended workspaces | #CA8A04 | 178 (DarkGoldenrod) | Yellow |
| `error` | Errors, failed checks, closed items, rejected landings, disconnected status | #DC2626 | 196 (Red) | Red |
| `muted` | Secondary text, metadata, timestamps, disabled items, separator lines | #A3A3A3 | 245 (Grey) | White (dim) |
| `surface` | Modal/overlay backgrounds, panel backgrounds | #262626 | 236 (DarkGrey) | Black (bright) |
| `border` | Box borders, separators, dividers, border-bottom on header, border-top on status bar | #525252 | 240 (Grey) | White (dim) |

#### Diff-Specific Token Mapping

| Token | Purpose | Truecolor | ANSI 256 | ANSI 16 |
|-------|---------|-----------|----------|--------|
| `diffAddedBg` | Background for addition lines | #1A4D1A | 22 (DarkGreen) | Dark green |
| `diffRemovedBg` | Background for deletion lines | #4D1A1A | 52 (DarkRed) | Dark red |
| `diffAddedText` | Foreground for `+` signs and inline highlights | #22C55E | 34 (Green) | Green |
| `diffRemovedText` | Foreground for `-` signs and inline highlights | #EF4444 | 196 (Red) | Red |
| `diffHunkHeader` | `@@ ... @@` hunk header lines | #06B6D4 | 37 (Cyan) | Cyan |

#### Text Attributes

| Attribute | SGR Code | Usage |
|-----------|----------|-------|
| `BOLD` | 1 | Headings, focused item labels, keybinding keys, strong emphasis |
| `DIM` | 2 | Muted helper text, disabled items, very secondary metadata |
| `UNDERLINE` | 4 | Links in markdown content, URL display |
| `REVERSE` | 7 | Focused list row highlight (alternative to colored background) |

#### Color Tier Detection Priority

The detection cascade (highest priority first):

1. `NO_COLOR` env var is set and non-empty → **ansi16**
2. `TERM=dumb` → **ansi16**
3. `COLORTERM=truecolor` or `COLORTERM=24bit` → **truecolor**
4. `TERM` contains `256color` → **ansi256**
5. Default → **ansi256**

#### Status-to-Token Mapping

Components that display entity status (issue state, workflow run result, workspace state, sync status, landing request state) use `statusToToken()` to resolve the appropriate color:

| Status Group | Values | Token |
|-------------|--------|-------|
| Success | open, active, running, passed, success, connected, ready, merged, completed | `success` |
| Warning | pending, draft, queued, syncing, in_progress, waiting, conflict, suspended, paused | `warning` |
| Error | closed, rejected, failed, error, disconnected, cancelled, timed_out, stopped | `error` |
| Primary | focused, selected, current | `primary` |
| Fallback | (any unrecognized string) | `muted` |

#### Component Token Usage

**Header Bar**: `theme.muted` for breadcrumb prefix, `theme.primary` for repo context, `statusToToken(connectionState)` for connection dot, `theme.primary` for unread count, `theme.border` for bottom border.

**Status Bar**: `theme.primary` for keybinding key labels, `theme.muted` for keybinding action labels, `theme.error` for error messages, `statusToToken(syncState)` for sync indicator, `theme.success` for auth confirmation, `theme.warning` for offline warning, `theme.primary` for help hint key, `theme.muted` for help hint text, `theme.border` for top border.

**Error Screen**: `theme.error` for heading and error message, `theme.muted` for stack trace text and toggle label, `theme.primary` for action keybinding keys, `theme.border` for stack trace border. Falls back to `createTheme(detectColorCapability())` when ThemeProvider is unavailable.

**Full-Screen Loading**: `theme.primary` for spinner/loading indicator.

**Skeleton List**: `theme.muted` for skeleton placeholder text.

**Overlay Layer**: `theme.surface` for background, `theme.border` for frame, `theme.primary` for focused items, `theme.muted` for secondary text, `theme.error` for error states within overlays.

**Diff Viewer**: `theme.diffAddedBg`/`theme.diffAddedText` for additions, `theme.diffRemovedBg`/`theme.diffRemovedText` for deletions, `theme.diffHunkHeader` for hunk headers.

#### NO_COLOR / TERM=dumb Behavior

When `NO_COLOR` is active or `TERM=dumb`:
- Colors fall to the ansi16 tier (basic terminal palette)
- Unicode indicators (✗, ▾, ▸, ●) are replaced with ASCII equivalents ([ERROR], v, >, *)
- The `isUnicodeSupported()` function returns `false`
- All semantic meaning is preserved through text labels, not color alone
- The TUI remains fully functional and navigable

#### Syntax Highlighting Palettes

Three tier-specific syntax palettes covering 17 token scopes:

| Scope | Truecolor | ANSI 256 | ANSI 16 |
|-------|-----------|----------|--------|
| keyword | #FF7B72 bold | 209 bold | Red bold |
| string | #A5D6FF | 153 | Cyan |
| comment | #8B949E italic | 248 italic | Gray dim |
| number | #79C0FF | 117 | Cyan |
| boolean | #79C0FF | 117 | Cyan |
| constant | #79C0FF | 117 | Cyan |
| function | #D2A8FF | 183 | Magenta |
| function.call | #D2A8FF | 183 | Magenta |
| constructor | #FFA657 | 215 | Yellow |
| type | #FFA657 | 215 | Yellow |
| operator | #FF7B72 | 209 | Red |
| variable | #E6EDF3 | 255 | White |
| property | #79C0FF | 117 | Cyan |
| bracket | #F0F6FC | 255 | White |
| punctuation | #F0F6FC | 255 | White |
| default | #E6EDF3 | 255 | White |
| keyword.import | #FF7B72 bold | 209 bold | Red bold |

#### Provider Stack Order

```
ErrorBoundary (outside ThemeProvider — uses detectColorCapability() directly)
  └─ ThemeProvider (detects tier, creates frozen tokens, provides context)
       └─ KeybindingProvider
            └─ OverlayManager
                 └─ AuthProvider
                      └─ APIClientProvider
                           └─ SSEProvider
                                └─ NavigationProvider
                                     └─ LoadingProvider
                                          └─ GlobalKeybindings
                                               └─ AppShell (HeaderBar + StatusBar + ScreenRouter)
```

### Documentation

The following documentation should be written for end users:

1. **TUI Color Support**: A section in the TUI documentation explaining that the TUI automatically detects terminal color capability and how users can influence it via `COLORTERM`, `TERM`, and `NO_COLOR` environment variables.
2. **NO_COLOR compliance**: A note that Codeplane TUI respects the `NO_COLOR` standard (https://no-color.org/) — setting `NO_COLOR=1` constrains output to basic colors.
3. **Terminal compatibility table**: A table listing known terminal emulators and which color tier they are detected as (iTerm2 → truecolor, Terminal.app → 256, linux console → ansi16, etc.).
4. **Troubleshooting**: Guidance for users who see wrong colors — check `echo $TERM` and `echo $COLORTERM`, and how to override with explicit `COLORTERM=truecolor codeplane tui`.

## Permissions & Security

### Authorization

The theme and color token system is entirely client-side. It does not interact with the API, does not require authentication, and does not check user roles. All users — authenticated, unauthenticated, anonymous — experience the same color behavior based solely on their terminal capabilities.

No authorization roles apply to this feature.

### Rate Limiting

No rate limiting applies. The theme system reads environment variables at process startup and performs no network requests.

### Data Privacy

- The theme system reads the following environment variables: `NO_COLOR`, `TERM`, `COLORTERM`, `LANG`. These are standard terminal configuration variables and contain no PII.
- The detected `ColorTier` is included in telemetry events as a property (see Telemetry section). This is a 3-value enum and does not identify the user.
- No color preferences or terminal capability data are transmitted to the server or stored in any persistent store beyond the process lifetime.

## Telemetry & Product Analytics

### Key Business Events

| Event | When Fired | Properties |
|-------|-----------|------------|
| `tui.theme.initialized` | ThemeProvider mounts and resolves theme | `color_tier: ColorTier`, `unicode_supported: boolean`, `term: string` (first 32 chars of TERM), `no_color: boolean` |
| `tui.theme.error_screen_rendered` | ErrorScreen renders with theme tokens | `color_tier: ColorTier`, `theme_source: "context" | "direct"` (whether ThemeProvider or direct createTheme was used), `error_name: string` |
| `tui.error_boundary.caught` | Error boundary catches an unhandled error | `color_tier: ColorTier` (included in context), `terminal_width: number`, `terminal_height: number`, `error_name: string`, `screen: string` |

### Funnel Metrics & Success Indicators

| Metric | Definition | Target |
|--------|-----------|--------|
| Color tier distribution | % of sessions per tier (truecolor / ansi256 / ansi16) | Track over time; expect truecolor majority (>60%) among active users |
| NO_COLOR adoption | % of sessions with `NO_COLOR` set | Informational; expect <5% |
| Theme initialization latency | Time from process start to ThemeProvider mount | <10ms (frozen singletons, no async work) |
| Error screen theme fallback rate | % of error screen renders using direct `createTheme()` vs context | Should be ~100% direct since ErrorBoundary is above ThemeProvider; validates architecture correctness |
| Zero hardcoded color violations | CI audit count of hardcoded hex/ANSI in component files | Must be 0 |

## Observability

### Logging

| Log Point | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| `theme.detect.capability` | `info` | `{ tier: ColorTier, term: string, colorterm: string, no_color: boolean }` | Color detection completes at startup |
| `theme.create.resolved` | `debug` | `{ tier: ColorTier, token_count: 12 }` | `createTheme()` returns frozen tokens |
| `theme.provider.mounted` | `debug` | `{ tier: ColorTier }` | ThemeProvider component mounts |
| `theme.hook.error` | `error` | `{ hook: "useTheme" | "useColorTier", message: string }` | Hook called outside ThemeProvider |
| `diff.syntax.style_create_failed` | `error` | `{ tier: ColorTier, error: string }` | `SyntaxStyle.fromStyles()` fails (native lib issue) |
| `diff.syntax.style_created` | `debug` | `{ tier: ColorTier }` | SyntaxStyle instance created successfully |
| `diff.syntax.style_destroyed` | `debug` | `{}` | SyntaxStyle instance destroyed on unmount |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `tui_theme_init_duration_ms` | Histogram | `tier` | Time to detect color capability and create theme tokens (buckets: 1, 2, 5, 10, 25, 50) |
| `tui_theme_sessions_total` | Counter | `tier`, `unicode` | Total TUI sessions by color tier and unicode support |
| `tui_theme_hook_errors_total` | Counter | `hook` | Count of useTheme/useColorTier calls outside provider |
| `tui_syntax_style_create_failures_total` | Counter | `tier` | Count of SyntaxStyle creation failures |
| `tui_theme_rgba_objects_allocated` | Gauge | `category` (semantic | syntax) | Number of RGBA objects allocated (should be constant after init) |

### Alerts

#### ALERT: `tui_theme_hook_errors_total` increasing

**Condition**: `rate(tui_theme_hook_errors_total[5m]) > 0`

**Severity**: Warning

**Runbook**:
1. Check which hook is failing (`useTheme` or `useColorTier`) from the `hook` label.
2. This indicates a component is being rendered outside the `<ThemeProvider>` tree.
3. Review recent deployments for provider stack reordering or new components added at the wrong level.
4. Check `apps/tui/src/index.tsx` to verify ThemeProvider wraps the correct subtree.
5. If the failing component is ErrorBoundary/ErrorScreen, verify it uses direct `createTheme()` instead of `useTheme()`.
6. Resolution: Fix component placement or change it to use direct theme creation.

#### ALERT: `tui_syntax_style_create_failures_total` increasing

**Condition**: `increase(tui_syntax_style_create_failures_total[1h]) > 10`

**Severity**: Warning

**Runbook**:
1. Check the `tier` label to see which color tier is failing.
2. `SyntaxStyle.fromStyles()` calls into the native Zig core via FFI. Failures here usually mean the native library is not loaded or corrupt.
3. Verify `@opentui/core` native binary is present and the correct architecture: `ls node_modules/@opentui/core/zig-out/`.
4. Check process stderr for native crash messages or segfault indicators.
5. Verify Zig build was clean: `bun run build` in `packages/core`.
6. Diff rendering will fall back to unstyled text when this fails — no data loss, just reduced readability.
7. Resolution: Rebuild native dependencies or pin to a known-good `@opentui/core` version.

#### ALERT: Theme RGBA allocation drift

**Condition**: `tui_theme_rgba_objects_allocated{category="semantic"} > 36`

**Severity**: Critical

**Runbook**:
1. Semantic theme tokens should allocate exactly 36 RGBA objects (12 tokens × 3 tiers).
2. If this gauge exceeds 36, it means `createTheme()` is creating new RGBA objects instead of returning frozen singletons.
3. Check `apps/tui/src/theme/tokens.ts` — all RGBA constants must be module-level `const` declarations, not created inside functions.
4. Verify `TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, and `ANSI16_TOKENS` are still `Object.freeze()`-d.
5. Check for any code that spreads or clones token objects (e.g., `{ ...tokens, primary: newColor }`).
6. Resolution: Restore singleton pattern. Every call to `createTheme("truecolor")` must return the same frozen object identity.

### Error Cases & Failure Modes

| Failure | Behavior | Recovery |
|---------|----------|----------|
| `process.env` is inaccessible | `detectColorCapability()` catches and returns `"ansi256"` (safe default) | Automatic |
| `RGBA.fromHex()` receives invalid hex | Throws immediately at module load; process exits | Fix color constant in source |
| `RGBA.fromInts()` receives out-of-range value | Clamped to 0–255 by RGBA constructor | Automatic (warn in debug log) |
| `useTheme()` outside provider | Throws with descriptive error message | Developer fixes component placement |
| `SyntaxStyle.fromStyles()` native failure | Returns null from `useDiffSyntaxStyle()`; diff renders without syntax highlighting | Automatic degradation |
| `SyntaxStyle.destroy()` called on null | No-op; ref check prevents call | Automatic |
| ThemeProvider unmounts mid-session | Should never happen (mounted at app root); children would lose context | Restart TUI |

## Verification

### Color Detection Tests (`e2e/tui/app-shell.test.ts` — DET-* suite)

| Test ID | Description |
|---------|-------------|
| DET-TC-001 | `COLORTERM=truecolor` → detects truecolor tier |
| DET-TC-002 | `COLORTERM=24bit` → detects truecolor tier |
| DET-TC-003 | `COLORTERM=truecolor` case insensitive — `COLORTERM=TrueColor` → truecolor |
| DET-256-001 | `TERM=xterm-256color` → detects ansi256 tier |
| DET-256-002 | `TERM=screen-256color` → detects ansi256 tier |
| DET-256-003 | `TERM=tmux-256color` → detects ansi256 tier |
| DET-256-004 | `TERM=rxvt-unicode-256color` → detects ansi256 tier |
| DET-16-001 | `TERM=dumb` → detects ansi16 tier |
| DET-16-002 | `TERM=linux` (no 256color, no COLORTERM) → detects ansi256 (default, not ansi16) |
| DET-NC-001 | `NO_COLOR=1` → detects ansi16 tier regardless of COLORTERM/TERM |
| DET-NC-002 | `NO_COLOR=1` + `COLORTERM=truecolor` → NO_COLOR wins, ansi16 |
| DET-NC-003 | `NO_COLOR=true` → detects ansi16 (any non-empty value) |
| DET-NC-004 | `NO_COLOR=` (empty string) → does NOT trigger NO_COLOR, falls through normally |
| DET-NC-005 | `NO_COLOR` unset entirely → does NOT trigger NO_COLOR |
| DET-DEF-001 | No TERM, no COLORTERM, no NO_COLOR → defaults to ansi256 |
| DET-DEF-002 | `TERM=xterm` (no 256color suffix) → defaults to ansi256 |
| DET-DUMB-001 | `TERM=dumb` + `COLORTERM=truecolor` → TERM=dumb wins, ansi16 |
| DET-DUMB-002 | `TERM=dumb` case sensitivity — `TERM=DUMB` (uppercased) → lowercased match, ansi16 |
| DET-UNI-001 | `isUnicodeSupported()` returns true for `TERM=xterm-256color` |
| DET-UNI-002 | `isUnicodeSupported()` returns false for `TERM=dumb` |
| DET-UNI-003 | `isUnicodeSupported()` returns false when `NO_COLOR=1` |
| DET-PRI-001 | Priority cascade: NO_COLOR checked before TERM=dumb before COLORTERM before TERM substring |

### Theme Token Tests (`e2e/tui/app-shell.test.ts` — THEME-* suite)

| Test ID | Description |
|---------|-------------|
| THEME-TC-001 | `createTheme("truecolor")` returns an object with all 12 token properties as RGBA instances |
| THEME-TC-002 | `createTheme("truecolor")` returns same identity on repeated calls (singleton) |
| THEME-TC-003 | Truecolor primary token has hex value #2563EB |
| THEME-TC-004 | Truecolor success token has hex value #16A34A |
| THEME-TC-005 | Truecolor error token has hex value #DC2626 |
| THEME-256-001 | `createTheme("ansi256")` returns an object with all 12 token properties as RGBA instances |
| THEME-256-002 | `createTheme("ansi256")` returns same identity on repeated calls |
| THEME-256-003 | ANSI256 primary token has RGBA(0, 95, 255, 255) |
| THEME-16-001 | `createTheme("ansi16")` returns an object with all 12 token properties as RGBA instances |
| THEME-16-002 | `createTheme("ansi16")` returns same identity on repeated calls |
| THEME-16-003 | ANSI16 primary token has RGBA(0, 0, 255, 255) |
| THEME-FRZ-001 | All three tier token objects are frozen (`Object.isFrozen()`) |
| THEME-FRZ-002 | Attempting to assign a new value to `tokens.primary` throws in strict mode |
| THEME-CNT-001 | `THEME_TOKEN_COUNT` equals 12 |
| THEME-ATTR-001 | `TextAttributes.BOLD` equals `1` (bit 0) |
| THEME-ATTR-002 | `TextAttributes.DIM` equals `2` (bit 1) |
| THEME-ATTR-003 | `TextAttributes.UNDERLINE` equals `4` (bit 2) |
| THEME-ATTR-004 | `TextAttributes.REVERSE` equals `8` (bit 3) |
| THEME-ATTR-005 | `TextAttributes.BOLD | TextAttributes.UNDERLINE` equals `5` (bitwise OR) |

### Status-to-Token Mapping Tests (`e2e/tui/app-shell.test.ts` — STT-* suite)

| Test ID | Description |
|---------|-------------|
| STT-SUC-001 | `statusToToken("open")` returns `"success"` |
| STT-SUC-002 | `statusToToken("merged")` returns `"success"` |
| STT-SUC-003 | `statusToToken("passed")` returns `"success"` |
| STT-SUC-004 | `statusToToken("connected")` returns `"success"` |
| STT-SUC-005 | `statusToToken("running")` returns `"success"` |
| STT-SUC-006 | `statusToToken("completed")` returns `"success"` |
| STT-SUC-007 | `statusToToken("active")` returns `"success"` |
| STT-SUC-008 | `statusToToken("ready")` returns `"success"` |
| STT-SUC-009 | `statusToToken("success")` returns `"success"` |
| STT-WRN-001 | `statusToToken("pending")` returns `"warning"` |
| STT-WRN-002 | `statusToToken("draft")` returns `"warning"` |
| STT-WRN-003 | `statusToToken("conflict")` returns `"warning"` |
| STT-WRN-004 | `statusToToken("suspended")` returns `"warning"` |
| STT-WRN-005 | `statusToToken("syncing")` returns `"warning"` |
| STT-WRN-006 | `statusToToken("queued")` returns `"warning"` |
| STT-WRN-007 | `statusToToken("in_progress")` returns `"warning"` |
| STT-WRN-008 | `statusToToken("waiting")` returns `"warning"` |
| STT-WRN-009 | `statusToToken("paused")` returns `"warning"` |
| STT-ERR-001 | `statusToToken("closed")` returns `"error"` |
| STT-ERR-002 | `statusToToken("failed")` returns `"error"` |
| STT-ERR-003 | `statusToToken("rejected")` returns `"error"` |
| STT-ERR-004 | `statusToToken("disconnected")` returns `"error"` |
| STT-ERR-005 | `statusToToken("cancelled")` returns `"error"` |
| STT-ERR-006 | `statusToToken("timed_out")` returns `"error"` |
| STT-ERR-007 | `statusToToken("stopped")` returns `"error"` |
| STT-ERR-008 | `statusToToken("error")` returns `"error"` |
| STT-PRI-001 | `statusToToken("focused")` returns `"primary"` |
| STT-PRI-002 | `statusToToken("selected")` returns `"primary"` |
| STT-PRI-003 | `statusToToken("current")` returns `"primary"` |
| STT-MUT-001 | `statusToToken("unknown_state")` returns `"muted"` (fallback) |
| STT-MUT-002 | `statusToToken("")` returns `"muted"` (empty string) |
| STT-CASE-001 | `statusToToken("OPEN")` returns `"success"` (case insensitive) |
| STT-CASE-002 | `statusToToken("Closed")` returns `"error"` (mixed case) |
| STT-CASE-003 | `statusToToken("pEnDiNg")` returns `"warning"` (random case) |

### Syntax Highlighting Tests (`e2e/tui/app-shell.test.ts` — SYN-* suite)

| Test ID | Description |
|---------|-------------|
| SYN-PAL-001 | `TRUECOLOR_PALETTE` has 17 entries (one per syntax scope) |
| SYN-PAL-002 | `ANSI256_PALETTE` has 17 entries |
| SYN-PAL-003 | `ANSI16_PALETTE` has 17 entries |
| SYN-PAL-004 | All palette entries have a non-null `fg` RGBA property |
| SYN-PAL-005 | `keyword` scope in all tiers has `bold: true` |
| SYN-PAL-006 | `comment` scope in truecolor and ansi256 has `italic: true` |
| SYN-PAL-007 | `comment` scope in ansi16 has `dim: true` |
| SYN-CNT-001 | `SYNTAX_TOKEN_COUNT` equals 17 |
| SYN-TIER-001 | `getPaletteForTier("truecolor")` returns `TRUECOLOR_PALETTE` |
| SYN-TIER-002 | `getPaletteForTier("ansi256")` returns `ANSI256_PALETTE` |
| SYN-TIER-003 | `getPaletteForTier("ansi16")` returns `ANSI16_PALETTE` |
| SYN-CREATE-001 | `createDiffSyntaxStyle("truecolor")` returns a SyntaxStyle instance (not null) |
| SYN-CREATE-002 | `createDiffSyntaxStyle("ansi256")` returns a SyntaxStyle instance (not null) |
| SYN-CREATE-003 | `createDiffSyntaxStyle("ansi16")` returns a SyntaxStyle instance (not null) |
| SYN-FTYPE-001 | `resolveFiletype("typescript", "foo.ts")` returns `"typescript"` (explicit language preferred) |
| SYN-FTYPE-002 | `resolveFiletype(null, "foo.ts")` returns path-detected filetype |
| SYN-FTYPE-003 | `resolveFiletype(null, "")` returns `undefined` (empty path, no language) |
| SYN-FTYPE-004 | `resolveFiletype("  ", "foo.ts")` returns path-detected filetype (whitespace-only language ignored) |
| SYN-FTYPE-005 | Path longer than 4096 chars → returns `undefined` (safety limit) |

### ThemeProvider Integration Tests (`e2e/tui/app-shell.test.ts` — TPROV-* suite)

| Test ID | Description |
|---------|-------------|
| TPROV-STACK-001 | ThemeProvider is a direct child of ErrorBoundary in the component tree |
| TPROV-STACK-002 | AuthProvider is a descendant of ThemeProvider (theme available to auth screens) |
| TPROV-CTX-001 | `useTheme()` inside ThemeProvider returns an object with all 12 token keys |
| TPROV-CTX-002 | `useColorTier()` inside ThemeProvider returns a valid ColorTier string |
| TPROV-CTX-003 | `useTheme()` outside ThemeProvider throws with message containing "ThemeProvider" |
| TPROV-CTX-004 | `useColorTier()` outside ThemeProvider throws with message containing "ThemeProvider" |
| TPROV-STABLE-001 | Token object identity is stable across re-renders (useTheme returns same reference) |
| TPROV-STABLE-002 | Terminal resize does not cause theme tokens to change identity |

### E2E Visual Rendering Tests (`e2e/tui/app-shell.test.ts` — TVIS-* suite)

| Test ID | Description |
|---------|-------------|
| TVIS-HDR-001 | Header bar renders with colored connection dot (snapshot test at 120×40 with `COLORTERM=truecolor`) |
| TVIS-HDR-002 | Header bar border renders (bottom border visible in terminal output) |
| TVIS-SB-001 | Status bar renders keybinding hints with two-tone coloring (key in primary, label in muted) |
| TVIS-SB-002 | Status bar sync indicator renders with correct color for "connected" state |
| TVIS-SB-003 | Status bar help hint renders "? help" |
| TVIS-ERR-001 | Error screen renders "✗ Something went wrong" heading when unicode supported |
| TVIS-ERR-002 | Error screen renders "[ERROR] Something went wrong" when `NO_COLOR=1` |
| TVIS-ERR-003 | Error screen renders action hints (r:restart, q:quit, s:trace, ?:help) |
| TVIS-LOAD-001 | Full-screen loading shows "Loading..." text |
| TVIS-SKEL-001 | Skeleton list renders placeholder rows with muted coloring |
| TVIS-NC-001 | Full app renders without crash when `NO_COLOR=1` — snapshot test |
| TVIS-NC-002 | Full app renders without crash when `TERM=dumb` — snapshot test |
| TVIS-DUMB-001 | Full app at `TERM=dumb` does not contain Unicode indicators (●, ✗, ▾, ▸) |
| TVIS-256-001 | Full app renders without crash at `TERM=xterm-256color` (no COLORTERM) |
| TVIS-TC-001 | Full app renders without crash at `COLORTERM=truecolor` |

### Hardcoded Color Audit Tests (`e2e/tui/app-shell.test.ts` — AUDIT-* suite)

| Test ID | Description |
|---------|-------------|
| AUDIT-HEX-001 | No `.tsx` files in `apps/tui/src/components/` contain hardcoded `fg="#` or `bg="#` string props (grep/regex scan) |
| AUDIT-HEX-002 | No `.tsx` files in `apps/tui/src/screens/` contain hardcoded `fg="#` or `bg="#` string props |
| AUDIT-HEX-003 | `apps/tui/src/theme/tokens.ts` is the only file that defines RGBA color constants via `RGBA.fromHex()` (aside from `lib/diff-syntax.ts` for syntax highlighting) |
| AUDIT-IMPORT-001 | All `.tsx` component files that use `fg=` or `bg=` props import from either `useTheme` hook or `theme/tokens` module |

### Diff Color Rendering Tests (`e2e/tui/diff.test.ts` — DIFF-CLR-* suite)

| Test ID | Description |
|---------|-------------|
| DIFF-CLR-001 | Addition lines in unified diff use green text (visual snapshot) |
| DIFF-CLR-002 | Deletion lines in unified diff use red text (visual snapshot) |
| DIFF-CLR-003 | Hunk headers use cyan text (visual snapshot) |
| DIFF-CLR-004 | Context lines use default terminal colors (no added fg/bg) |
| DIFF-CLR-005 | Syntax highlighting renders in truecolor mode — keywords are bold and colored differently from strings |
| DIFF-CLR-006 | Syntax highlighting renders in ansi256 mode — visual hierarchy preserved |
| DIFF-CLR-007 | Syntax highlighting renders in ansi16 mode — basic colors applied |
