# Research Findings: `tui-theme-tokens`

## 1. Existing Theme System (`apps/tui/src/theme/`)

### `apps/tui/src/theme/detect.ts`
- Is fully implemented and provides the `detectColorCapability()` function.
- Exports the `ColorTier` type (`"truecolor" | "ansi256" | "ansi16"`).
- The logic checks environment variables (`NO_COLOR`, `TERM`, `COLORTERM`) in priority order.
- This module matches exactly what the specification states as the dependency for the new token system.

### `apps/tui/src/theme/index.ts`
- Acts as a barrel file, currently exporting from `detect.ts` and `syntaxStyle.ts`.
- It specifically contains comments noting that `tokens.ts` and `resolve.ts` are planned, with the 12 exact semantic tokens listed in the comment.
- We will need to update this file to export the new contents of `tokens.ts`.

## 2. Compatibility Target (`apps/tui/src/screens/Agents/components/colors.ts`)

- The existing Agent screen uses an older, local implementation of colors (`COLORS` resolved via an internal `resolveColors(tier)` function).
- It imports `RGBA` from `@opentui/core`.
- It implements a subset of the tokens: `primary`, `success`, `warning`, `error`, `muted`, and `border`.
- **Truecolor values:** Match the spec exactly (e.g., `#2563EB`, `#16A34A`, etc.).
- **ANSI 256 values:** Match the spec mostly, but there is a discrepancy on the `muted` token:
  - `colors.ts` uses `RGBA.fromInts(168, 168, 168, 255)` (commented as ANSI 245).
  - The specification for `tokens.ts` explicitly instructs using the true ANSI 245 value `RGBA.fromInts(138, 138, 138, 255)`.
  - The spec notes: *"The `TOKEN-COMPAT-001` test will detect the discrepancy with colors.ts, and the migration ticket will align both files."*
- **ANSI 16 values:** Match the spec exactly (e.g., `RGBA.fromInts(0, 0, 255, 255)` for primary).

## 3. Testing Environment (`e2e/tui/app-shell.test.ts`)

- The test suite uses `bun:test` and sets up tests with `describe` and `test` blocks.
- It relies heavily on `bunEval` to test pure functions independently of the full TUI lifecycle (which uses `launchTUI`).
- All `tui-theme-tokens` tests should be appended to this file inside a new `describe("TUI_APP_SHELL — Theme token definitions", () => { ... })` block.
- The file already has extensive tests for navigation, package scaffolding, dependency resolution, and color capability detection (`theme/detect.ts`). The new tests will fit seamlessly into this structure.

## 4. OpenTUI Types (`@opentui/core`)

- The code in `colors.ts` shows that `RGBA` is instantiated via `RGBA.fromHex("#...")` and `RGBA.fromInts(r, g, b, a)`.
- Token values in the new `tokens.ts` file should be instantiated using these exact methods to ensure compatibility with OpenTUI component props (which expect `RGBA` instances).

## Action Plan Summary
1. **Create `apps/tui/src/theme/tokens.ts`**: Implement the `ThemeTokens` interface, RGBA constants, tier-specific objects (`TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, `ANSI16_TOKENS`), `createTheme()`, `TextAttributes`, and `statusToToken()`.
2. **Update `apps/tui/src/theme/index.ts`**: Add exports for the new types and constants.
3. **Update `e2e/tui/app-shell.test.ts`**: Append the new `describe` block containing all 26 specified tests, using `bunEval` where appropriate to test token instantiation and immutability.