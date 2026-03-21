# TUI_THEME_AND_COLOR_TOKENS

Specification for TUI_THEME_AND_COLOR_TOKENS.

## High-Level User POV

When a terminal-native developer launches the Codeplane TUI, the interface presents a consistent, purposeful color language that makes every screen immediately scannable. Semantic colors communicate meaning without requiring the user to read labels: blue highlights the currently focused item or active tab, green signals open issues and successful checks, yellow marks pending states and conflicts, and red flags errors and failed runs. Secondary text like timestamps, metadata counts, and helper hints appear in a muted gray that recedes from primary content, letting the user's eye track what matters.

The color system works everywhere the TUI runs. On a modern terminal with truecolor support (iTerm2, Ghostty, WezTerm, Kitty, Windows Terminal), colors render at full 24-bit fidelity with subtle background shading for diff hunks and modal overlays. On terminals limited to 256 colors, the TUI selects the closest ANSI 256 palette index for each semantic token — the visual hierarchy remains intact even though gradients are coarser. On the most constrained 16-color terminals (bare Linux console, old xterm configurations), the TUI maps tokens down to the basic ANSI set: blue for primary, green for success, yellow for warning, red for error, and the default foreground for text. The user never sees a garbled or invisible interface regardless of terminal capability.

The TUI uses a single dark theme. It assumes a dark terminal background and does not attempt to detect or adapt to light backgrounds. All foreground colors are selected for readable contrast against dark surfaces. Box borders, separators, and panel dividers use a mid-gray that visually structures the layout without competing with content.

Diff views use dedicated color pairs: additions appear with green text on a dark green background, deletions with red text on a dark red background, and hunk headers in cyan. These colors are distinct from the semantic tokens used elsewhere, ensuring diffs remain visually identifiable even when nested inside landing request or code explorer screens.

The color system applies globally and consistently across every TUI surface: header bar breadcrumbs, status bar indicators, list view focus highlights, form field borders, modal overlays, command palette results, notification badges, markdown-rendered content, code blocks with syntax highlighting, and the sync status indicator. No component defines its own ad-hoc colors — every color value traces back to a named semantic token.

## Acceptance Criteria

### Definition of Done

- [ ] A `ThemeProvider` React context wraps the TUI application root and exposes all semantic color tokens to every descendant component.
- [ ] Seven core semantic tokens are defined and applied: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`.
- [ ] Five diff-specific tokens are defined and applied: `diffAddedBg`, `diffRemovedBg`, `diffAddedText`, `diffRemovedText`, `diffHunkHeader`.
- [ ] Terminal color capability is detected at startup using the `COLORTERM` environment variable and OpenTUI's `TerminalPalette` detection.
- [ ] Three color tiers render correctly: truecolor (24-bit), ANSI 256, and ANSI 16.
- [ ] All token values are expressed as `RGBA` objects from `@opentui/core` and passed to OpenTUI component props (`fg`, `bg`, `borderColor`, `backgroundColor`).
- [ ] No component in the TUI uses a hardcoded color string — all colors resolve through the token system.
- [ ] The status bar sync indicator uses `success` (connected), `warning` (syncing), `error` (disconnected) tokens.
- [ ] The notification badge count uses `primary` for the count text.
- [ ] Focused list items use `primary` foreground or reverse video.
- [ ] Issue/landing status labels use `success` (open), `error` (closed/rejected), `warning` (pending/draft).
- [ ] Markdown rendering inherits the token palette for headings, links, code blocks, and blockquotes.
- [ ] Syntax highlighting in `<code>` blocks uses the `SyntaxStyle` system with a dark-theme token set.

### Edge Cases

- [ ] When `COLORTERM` is unset and `TERM` indicates a 16-color terminal (e.g., `linux`, `xterm`), tokens degrade to the basic 16 ANSI colors without crashing or rendering invisible text.
- [ ] When the terminal background is not dark (user misconfiguration), text remains readable — foreground colors never match the dark-theme background assumption exactly (no white-on-white or black-on-black).
- [ ] When the terminal does not support OSC palette queries (detection times out after 300ms), the TUI falls back to ANSI 256 defaults without blocking startup or delaying first render beyond the 200ms target.
- [ ] At minimum terminal size (80×24), colors remain applied — the responsive layout changes (sidebar collapse, column hiding) do not strip colors.
- [ ] When the terminal is resized during operation, colors do not reset, flicker, or revert to defaults; the re-layout preserves the full token palette.
- [ ] `"transparent"` is used correctly for `surface` backgrounds on terminals that support alpha compositing; on terminals that do not, the fallback is the nearest dark gray.
- [ ] Color tokens do not allocate new `Float32Array` instances on every render — `RGBA` objects are created once and referenced by identity.

### Boundary Constraints

- [ ] ANSI 256 color indices must be valid (0–255); any computed fallback index outside this range clamps to the nearest valid value.
- [ ] Hex color values must be 3, 4, 6, or 8 character strings (after `#` prefix); invalid hex falls back to magenta as per OpenTUI's `hexToRgb` behavior, and a warning is logged.
- [ ] Color token names are a closed set — no runtime dynamic token creation. The token type is a union of the defined string literal names.
- [ ] The `ThemeProvider` does not accept user-supplied themes. The single dark theme is baked in. Custom themes are a future extension.

## Design

### Color Token Registry

The theme system defines a single, frozen `Theme` object containing all color tokens as `RGBA` values. This object is created once at startup and provided via React context.

**Semantic tokens (used across all screens):**

| Token | Purpose | Truecolor Hex | ANSI 256 Index | ANSI 16 Name |
|-------|---------|---------------|----------------|---------------|
| `primary` | Focused items, links, active tabs, interactive highlights | `#2563EB` | 33 | Blue |
| `success` | Open issues, passed checks, additions, connected status | `#16A34A` | 34 | Green |
| `warning` | Pending states, conflict indicators, syncing status | `#CA8A04` | 178 | Yellow |
| `error` | Errors, failed checks, closed/rejected items, disconnected status | `#DC2626` | 196 | Red |
| `muted` | Secondary text, metadata, timestamps, disabled items | `#A3A3A3` | 245 | White (dim) |
| `surface` | Modal/overlay backgrounds, panel backgrounds | `#262626` | 236 | Black (bright) |
| `border` | Box borders, separators, dividers | `#525252` | 240 | White (dim) |

**Diff tokens (used in diff viewer, landing request changes, code explorer):**

| Token | Purpose | Truecolor Hex | ANSI 256 Index |
|-------|---------|---------------|----------------|
| `diffAddedBg` | Background for addition lines | `#1A4D1A` | 22 |
| `diffRemovedBg` | Background for deletion lines | `#4D1A1A` | 52 |
| `diffAddedText` | Foreground for addition signs and inline highlights | `#22C55E` | 34 |
| `diffRemovedText` | Foreground for deletion signs and inline highlights | `#EF4444` | 196 |
| `diffHunkHeader` | Hunk header `@@ ... @@` lines | `#06B6D4` | 37 |

**Text attribute tokens:**

| Token | Attributes |
|-------|------------|
| `bold` | Headings, focused item labels, strong emphasis |
| `dim` | Muted helper text, disabled items |
| `underline` | Links in markdown content |
| `reverse` | Focused list row highlight (alternative to colored background) |

### Component Layout: ThemeProvider

The `ThemeProvider` wraps the entire TUI application tree and provides the theme context. All descendant components access tokens via a `useTheme()` hook that returns the frozen `Theme` object.

### Token Application by Component

**Header bar (`<box>`):**
- Breadcrumb text: `muted` foreground, current screen segment in default foreground (bold)
- Repository context: `primary` foreground
- Connection status dot: `success` (connected), `warning` (syncing), `error` (disconnected)
- Notification badge: `primary` for count
- Bottom border: `border` color

**Status bar (`<box>`):**
- Keybinding hints: `muted` foreground, key labels in `primary`
- Sync status text: `success` / `warning` / `error` depending on state
- Help hint: `muted` foreground
- Top border: `border` color

**List views (`<scrollbox>` + `<box>`):**
- Focused row: `primary` foreground with reverse attribute, or `primary` background with contrasting text
- Unfocused rows: default foreground
- Metadata columns: `muted` foreground
- Status badges: `success` (open), `error` (closed), `warning` (pending/draft)

**Forms (`<box>` + `<input>` / `<textarea>` / `<select>`):**
- Input borders: `border` when unfocused, `primary` when focused
- Placeholder text: `muted`
- Validation errors: `error` foreground
- Submit button: `primary` background

**Diff viewer (`<diff>`):**
- Props: `addedBg={diffAddedBg}`, `removedBg={diffRemovedBg}`, `addedSignColor={diffAddedText}`, `removedSignColor={diffRemovedText}`
- Hunk header: `diffHunkHeader` foreground
- Line numbers: `muted` foreground

**Modal overlays (`<box>` position=absolute):**
- Background: `surface`, border: `border`
- Dismiss hint: `muted`

**Command palette (`<box>` + `<input>` + `<scrollbox>`):**
- Input border: `primary`
- Fuzzy match highlights: `primary` foreground (bold)
- Result descriptions: `muted`
- Selected result: reverse video or `primary` background

**Markdown (`<markdown>`):**
- Links: `primary` foreground, underlined
- Code spans/blocks: `surface` background
- Blockquotes: `muted` foreground with `border` left indicator

**Code blocks (`<code>`):**
- Background: `surface`
- Syntax highlighting via `SyntaxStyle` dark-theme tokens
- Line numbers: `muted`

### Keybindings

The theme system introduces no new keybindings. It is a passive infrastructure layer consumed by all screens.

### Terminal Resize Behavior

On resize, `useTerminalDimensions()` triggers re-layout. Color tokens are size-independent constants and are not recalculated. The same `RGBA` instances are reused. At < 80×24, the "terminal too small" message renders using `error` foreground.

### Color Capability Detection

At startup:
1. Check `COLORTERM`: `"truecolor"` or `"24bit"` → truecolor tier
2. Check `TERM`: contains `"256color"` → ansi256 tier
3. Otherwise → ansi16 tier
4. Optional OSC palette detection (300ms timeout) for more accurate mapping
5. Store as `ColorTier` enum: `"truecolor" | "ansi256" | "ansi16"`
6. `ThemeProvider` selects appropriate color values based on tier

### Data Hooks

The theme system does not directly consume `@codeplane/ui-core` data hooks. Components that consume data hooks apply tokens via a `statusToToken()` utility that maps entity states to semantic colors.

## Permissions & Security

### Authorization

- The theme and color token system requires **no specific authorization role**. It is a client-side presentation layer operating entirely within the TUI process.
- Token colors are hardcoded constants — they are not fetched from the API and do not require authentication.
- No user data is exposed or modified by the theme system.

### Rate Limiting

- Not applicable. The theme system makes zero API calls.
- OSC palette detection communicates with the local terminal emulator via stdin/stdout, not the network.

### Token-Based Auth

- The theme system does not interact with authentication tokens. It initializes before the auth check and functions identically regardless of auth state.
- The "Session expired" error message on 401 responses uses the `error` token — the only indirect interaction between themes and auth.

### Security Considerations

- Color token values are not user-supplied. No injection or escape-sequence-injection attack surface exists.
- OSC palette detection reads terminal responses; the parser strictly validates response format against known regex patterns and discards malformed input.
- The `ThemeProvider` does not persist any data to disk, environment variables, or the network.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Purpose |
|-----------|---------|----------|
| `tui.color_tier_detected` | TUI startup, after capability detection | Understand terminal ecosystem distribution |
| `tui.theme_provider_init` | ThemeProvider mounts successfully | Confirm theme system initialization |
| `tui.color_fallback_triggered` | OSC detection times out, falling back to env-var-based detection | Track terminals with limited capability detection |

### Event Properties

**`tui.color_tier_detected`:**
- `colorTier`: `"truecolor"` | `"ansi256"` | `"ansi16"`
- `colorterm`: value of `COLORTERM` env var (or `null`)
- `term`: value of `TERM` env var (or `null`)
- `oscSupported`: `boolean` — whether OSC palette detection succeeded
- `tmux`: `boolean` — whether running inside tmux

**`tui.theme_provider_init`:**
- `colorTier`: resolved color tier
- `tokenCount`: number of tokens in the active theme
- `initDurationMs`: time from TUI startup to ThemeProvider mount

**`tui.color_fallback_triggered`:**
- `fallbackReason`: `"osc_timeout"` | `"osc_unsupported"` | `"env_var_missing"`
- `fallbackTier`: the color tier used after fallback

### Success Indicators

- **100% of TUI sessions** emit `tui.color_tier_detected` — confirms detection always completes.
- **0% of sessions** report `colorTier: "ansi16"` with `COLORTERM=truecolor` — confirms detection accuracy.
- **< 5% of sessions** trigger `tui.color_fallback_triggered` — indicates most terminals support direct detection.
- **ThemeProvider init time < 50ms** in p95 — confirms color detection does not block startup.

## Observability

### Logging

| Log Level | Event | Message Pattern |
|-----------|-------|-----------------|
| `info` | Color tier detected | `"Color capability detected: {tier} (COLORTERM={colorterm}, TERM={term})"` |
| `debug` | OSC detection started | `"Starting OSC palette detection (timeout: 300ms)"` |
| `debug` | OSC detection result | `"OSC palette detection: {result} ({durationMs}ms)"` |
| `warn` | Invalid hex color in token | `"Invalid color value in theme token '{token}': {value}, falling back to magenta"` |
| `warn` | OSC detection timeout | `"OSC palette detection timed out after 300ms, using env-var fallback"` |
| `error` | ThemeProvider mount failure | `"ThemeProvider failed to initialize: {error}"` |
| `debug` | Color tier resolved per token | `"Token '{token}' resolved to {hex} (tier: {tier})"` — logged once at startup |

### Error Cases

| Error Scenario | Detection | Recovery |
|---------------|-----------|----------|
| OSC detection times out | 300ms timer expires | Fall back to `COLORTERM`/`TERM` env vars. Log warning. No user-visible disruption. |
| `COLORTERM` and `TERM` both unset | Both env vars undefined | Default to `ansi256` tier. Log info-level notice. |
| Invalid hex in token definition | `hexToRgb` parse failure | OpenTUI returns magenta as sentinel. Log warning with token name. |
| Terminal resize during color detection | `useOnResize` fires before detection completes | Detection continues independently. Token values filled when detection completes. |
| SSE disconnect during themed render | Network failure | Theme tokens are local constants — no effect on colors. Status bar indicator changes from `success` to `error` token. |
| React error boundary catches render crash | Uncaught exception | Error boundary renders using `error` token for message, `muted` for stack trace. Tokens remain available. |
| Terminal emulator crash during OSC query | stdin stops responding | Detection timeout fires. `TerminalPalette.cleanup()` closes pending listeners. |

### Failure Modes

- **Degraded color rendering**: Detection resolves to `ansi16` when terminal supports 256 colors. Functional but visually impoverished. Users can set `COLORTERM=truecolor` to override.
- **Invisible text**: User's light terminal background causes dark-on-dark. Documentation notes "dark terminal background required."
- **Token not found**: Component references non-existent token name. TypeScript catches at compile time. Runtime fallback to terminal default foreground/background.

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

#### Terminal Snapshot Tests

- **THEME_SNAPSHOT_01**: `renders header bar with correct semantic colors at 120x40` — Launch TUI at 120x40, capture snapshot, assert primary-colored repo context, muted breadcrumb separators, border-colored bottom separator.
- **THEME_SNAPSHOT_02**: `renders status bar with correct semantic colors at 120x40` — Launch TUI at 120x40, capture bottom row snapshot, assert muted hints, success/warning/error sync color, muted help hint.
- **THEME_SNAPSHOT_03**: `renders focused list item with primary color at 120x40` — Navigate to repo list, assert item 0 focused with primary color, press j, assert item 1 focused and item 0 default.
- **THEME_SNAPSHOT_04**: `renders modal overlay with surface background and border color at 120x40` — Press `:` to open command palette, assert surface background, border box border, primary input border.
- **THEME_SNAPSHOT_05**: `renders diff view with correct diff color tokens at 120x40` — Navigate to diff view, assert green addition backgrounds, red deletion backgrounds, cyan hunk headers, muted line numbers.
- **THEME_SNAPSHOT_06**: `renders issue status badges with semantic colors at 120x40` — Navigate to issue list, assert open issues use success color, closed use error color.
- **THEME_SNAPSHOT_07**: `renders markdown content with token-derived colors at 120x40` — Navigate to issue detail with markdown body, assert bold headings, primary-colored underlined links, surface-background code blocks.

#### Color Tier Fallback Tests

- **THEME_TIER_01**: `detects truecolor when COLORTERM=truecolor is set` — Set COLORTERM=truecolor, launch TUI, assert truecolor tier, assert 24-bit SGR sequences in output.
- **THEME_TIER_02**: `detects ansi256 when TERM contains 256color` — Set COLORTERM="", TERM=xterm-256color, launch TUI, assert ansi256 tier, assert 256-color SGR sequences.
- **THEME_TIER_03**: `falls back to ansi16 when TERM indicates basic terminal` — Set COLORTERM="", TERM=xterm, launch TUI, assert ansi16 tier, assert basic SGR sequences.
- **THEME_TIER_04**: `falls back to ansi256 when COLORTERM and TERM are both unset` — Unset both, launch TUI, assert ansi256 tier.

#### Keyboard Interaction Tests

- **THEME_KEY_01**: `focus highlight follows j/k navigation in list views` — Navigate to repo list, assert item 0 primary focus, press j, assert item 1 primary focus and item 0 default, press k, assert item 0 focused again.
- **THEME_KEY_02**: `command palette uses primary color for fuzzy match highlights` — Press `:`, type "iss", assert matching chars rendered with primary color and bold.
- **THEME_KEY_03**: `help overlay renders keybinding keys with primary token` — Press `?`, capture snapshot, assert key labels in primary color.
- **THEME_KEY_04**: `Esc dismisses modal and restores underlying screen colors` — Press `:`, then Esc, assert overlay dismissed and screen colors fully restored.

#### Responsive Size Tests

- **THEME_RESPONSIVE_01**: `colors render correctly at minimum 80x24 terminal` — Launch at 80x24, navigate to repo list, assert all semantic colors present despite collapsed layout.
- **THEME_RESPONSIVE_02**: `colors render correctly at standard 120x40 terminal` — Launch at 120x40, navigate to repo list, assert full color application including sidebar borders and muted metadata.
- **THEME_RESPONSIVE_03**: `colors render correctly at large 200x60 terminal` — Launch at 200x60, navigate to diff view, assert full diff color tokens and expanded muted metadata.
- **THEME_RESPONSIVE_04**: `colors survive terminal resize from 200x60 to 80x24` — Launch at 200x60, resize to 80x24, assert layout collapses but all semantic colors remain.
- **THEME_RESPONSIVE_05**: `colors survive terminal resize from 80x24 to 120x40` — Launch at 80x24, resize to 120x40, assert expanded layout gains sidebar with border color.

#### Error State Tests

- **THEME_ERROR_01**: `error boundary screen uses error and muted tokens` — Trigger React error, assert error message in error color, stack trace in muted, restart/quit prompts visible.
- **THEME_ERROR_02**: `network error inline message uses error token` — Navigate to screen with API failure, assert error message in error color, retry hint in muted.
- **THEME_ERROR_03**: `auth error message uses error token` — Launch with invalid token, assert "Session expired" in error color.
- **THEME_ERROR_04**: `SSE disconnect updates status bar indicator from success to error token` — Simulate SSE disconnect, assert status bar changes to error color, simulate reconnect, assert return to success.

#### Consistency Tests

- **THEME_CONSISTENCY_01**: `no hardcoded color strings in rendered output outside token values` — Navigate through multiple screens, assert all SGR sequences correspond to known token values.
- **THEME_CONSISTENCY_02**: `loading states use muted token for spinner and placeholder text` — Navigate to slow-loading screen, assert Loading text uses muted foreground.
- **THEME_CONSISTENCY_03**: `form validation errors display in error token color` — Submit empty required field, assert validation message in error color and field border changes to error.
