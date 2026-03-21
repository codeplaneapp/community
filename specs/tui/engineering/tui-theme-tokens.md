# Engineering Specification: `tui-theme-tokens`

## Define semantic color token values for all three color tiers

---

## Overview

This ticket creates `apps/tui/src/theme/tokens.ts`, the concrete color value definitions for every semantic token at each color tier (truecolor, ansi256, ansi16). This module is the single source of truth for all color values used throughout the TUI. It is consumed by the (future) `ThemeProvider` and can be used directly by any module that needs resolved color values.

### Dependency

This ticket depends on `tui-color-detection`, which is already implemented at `apps/tui/src/theme/detect.ts`. The `ColorTier` type and `detectColorCapability()` function from that module are consumed here.

### Non-Goals

- This ticket does **not** implement `ThemeProvider` (React context). That is a separate ticket.
- This ticket does **not** migrate existing consumers (`screens/Agents/components/colors.ts`, `lib/diff-syntax.ts`) to the new token system. Those are future migration tickets.
- This ticket does **not** implement runtime theme switching or user-configurable themes.

---

## Implementation Plan

### Step 1: Define the `ThemeTokens` interface

**File:** `apps/tui/src/theme/tokens.ts`

Define the TypeScript interface that describes the shape of a resolved theme. This is the contract that all consumers will code against.

```typescript
import type { RGBA } from "@opentui/core";
import type { ColorTier } from "./detect.js";

/**
 * Semantic color tokens for the TUI theme.
 *
 * Every color used in the TUI resolves to one of these tokens.
 * Components reference tokens by name via useTheme(), never raw ANSI codes.
 *
 * Token values are RGBA objects from @opentui/core (Float32Array-backed).
 * They are created once at startup and reused by identity — no per-render allocation.
 */
export interface ThemeTokens {
  // ── Core semantic tokens ────────────────────────────────────────────
  /** Focused items, links, active tabs, interactive highlights */
  readonly primary: RGBA;
  /** Open issues, passed checks, additions, connected status */
  readonly success: RGBA;
  /** Pending states, conflict indicators, syncing status */
  readonly warning: RGBA;
  /** Errors, failed checks, closed/rejected items, disconnected status */
  readonly error: RGBA;
  /** Secondary text, metadata, timestamps, disabled items */
  readonly muted: RGBA;
  /** Modal/overlay backgrounds, panel backgrounds */
  readonly surface: RGBA;
  /** Box borders, separators, dividers */
  readonly border: RGBA;

  // ── Diff-specific tokens ────────────────────────────────────────────
  /** Background for addition lines in diff view */
  readonly diffAddedBg: RGBA;
  /** Background for deletion lines in diff view */
  readonly diffRemovedBg: RGBA;
  /** Foreground for addition signs and inline highlights */
  readonly diffAddedText: RGBA;
  /** Foreground for deletion signs and inline highlights */
  readonly diffRemovedText: RGBA;
  /** Hunk header @@ ... @@ lines */
  readonly diffHunkHeader: RGBA;
}
```

**Design rationale:**
- All properties are `readonly` at the interface level to signal immutability.
- `RGBA` is the type used by OpenTUI component props (`fg`, `bg`, `borderColor`, `backgroundColor`), so tokens pass through with zero conversion.
- The 12 tokens match the design spec exactly (7 core + 5 diff).

### Step 2: Define RGBA constants for each tier

**File:** `apps/tui/src/theme/tokens.ts` (continued)

All RGBA instances are created at module scope (not inside functions) as `const` module-level variables. This ensures each value is allocated exactly once and reused by identity across the entire TUI process lifetime.

#### Truecolor constants

```typescript
// ── Truecolor RGBA constants (hex → RGBA, allocated once) ─────────────
const TC_PRIMARY        = RGBA.fromHex("#2563EB");
const TC_SUCCESS        = RGBA.fromHex("#16A34A");
const TC_WARNING        = RGBA.fromHex("#CA8A04");
const TC_ERROR          = RGBA.fromHex("#DC2626");
const TC_MUTED          = RGBA.fromHex("#A3A3A3");
const TC_SURFACE        = RGBA.fromHex("#262626");
const TC_BORDER         = RGBA.fromHex("#525252");
const TC_DIFF_ADDED_BG  = RGBA.fromHex("#1A4D1A");
const TC_DIFF_REMOVED_BG = RGBA.fromHex("#4D1A1A");
const TC_DIFF_ADDED_TEXT = RGBA.fromHex("#22C55E");
const TC_DIFF_REMOVED_TEXT = RGBA.fromHex("#EF4444");
const TC_DIFF_HUNK_HEADER = RGBA.fromHex("#06B6D4");
```

#### ANSI 256 constants

ANSI 256 color indices are converted to their standard RGB equivalents using `RGBA.fromInts()`. The RGB values correspond to the standard xterm-256color palette entries:

| Index | RGB (0-255) | Token |
|-------|-------------|-------|
| 33  | (0, 95, 255) | primary |
| 34  | (0, 175, 0) | success |
| 178 | (215, 175, 0) | warning |
| 196 | (255, 0, 0) | error |
| 245 | (138, 138, 138) | muted |
| 236 | (48, 48, 48) | surface |
| 240 | (88, 88, 88) | border |
| 22  | (0, 95, 0) | diffAddedBg |
| 52  | (95, 0, 0) | diffRemovedBg |
| 34  | (0, 175, 0) | diffAddedText |
| 196 | (255, 0, 0) | diffRemovedText |
| 37  | (0, 175, 175) | diffHunkHeader |

```typescript
// ── ANSI 256 RGBA constants (index → RGB via standard xterm-256color table) ──
const A256_PRIMARY          = RGBA.fromInts(0, 95, 255, 255);     // index 33
const A256_SUCCESS          = RGBA.fromInts(0, 175, 0, 255);      // index 34
const A256_WARNING          = RGBA.fromInts(215, 175, 0, 255);    // index 178
const A256_ERROR            = RGBA.fromInts(255, 0, 0, 255);      // index 196
const A256_MUTED            = RGBA.fromInts(138, 138, 138, 255);  // index 245
const A256_SURFACE          = RGBA.fromInts(48, 48, 48, 255);     // index 236
const A256_BORDER           = RGBA.fromInts(88, 88, 88, 255);     // index 240
const A256_DIFF_ADDED_BG    = RGBA.fromInts(0, 95, 0, 255);      // index 22
const A256_DIFF_REMOVED_BG  = RGBA.fromInts(95, 0, 0, 255);      // index 52
const A256_DIFF_ADDED_TEXT   = RGBA.fromInts(0, 175, 0, 255);     // index 34
const A256_DIFF_REMOVED_TEXT = RGBA.fromInts(255, 0, 0, 255);     // index 196
const A256_DIFF_HUNK_HEADER  = RGBA.fromInts(0, 175, 175, 255);  // index 37
```

#### ANSI 16 constants

ANSI 16 maps to the basic terminal color names. For diff tokens on 16-color terminals, tokens fall back to the closest basic color since background shading is not reliably available:

```typescript
// ── ANSI 16 RGBA constants (basic terminal colors) ────────────────────
const A16_PRIMARY          = RGBA.fromInts(0, 0, 255, 255);      // Blue
const A16_SUCCESS          = RGBA.fromInts(0, 255, 0, 255);      // Green
const A16_WARNING          = RGBA.fromInts(255, 255, 0, 255);    // Yellow
const A16_ERROR            = RGBA.fromInts(255, 0, 0, 255);      // Red
const A16_MUTED            = RGBA.fromInts(192, 192, 192, 255);  // White (dim)
const A16_SURFACE          = RGBA.fromInts(64, 64, 64, 255);     // Black (bright)
const A16_BORDER           = RGBA.fromInts(192, 192, 192, 255);  // White (dim)
const A16_DIFF_ADDED_BG    = RGBA.fromInts(0, 128, 0, 255);     // Green (dark)
const A16_DIFF_REMOVED_BG  = RGBA.fromInts(128, 0, 0, 255);     // Red (dark)
const A16_DIFF_ADDED_TEXT   = RGBA.fromInts(0, 255, 0, 255);     // Green
const A16_DIFF_REMOVED_TEXT = RGBA.fromInts(255, 0, 0, 255);     // Red
const A16_DIFF_HUNK_HEADER  = RGBA.fromInts(0, 255, 255, 255);  // Cyan
```

### Step 3: Create frozen token objects per tier

**File:** `apps/tui/src/theme/tokens.ts` (continued)

Each tier's token object is assembled from its constants and frozen with `Object.freeze()`:

```typescript
/**
 * Truecolor (24-bit) theme tokens.
 * Used when COLORTERM=truecolor or COLORTERM=24bit.
 * Full hex fidelity — subtle background shading for diffs and overlays.
 */
const TRUECOLOR_TOKENS: Readonly<ThemeTokens> = Object.freeze({
  primary:         TC_PRIMARY,
  success:         TC_SUCCESS,
  warning:         TC_WARNING,
  error:           TC_ERROR,
  muted:           TC_MUTED,
  surface:         TC_SURFACE,
  border:          TC_BORDER,
  diffAddedBg:     TC_DIFF_ADDED_BG,
  diffRemovedBg:   TC_DIFF_REMOVED_BG,
  diffAddedText:   TC_DIFF_ADDED_TEXT,
  diffRemovedText: TC_DIFF_REMOVED_TEXT,
  diffHunkHeader:  TC_DIFF_HUNK_HEADER,
});

/**
 * ANSI 256-color theme tokens.
 * Used when TERM contains '256color' and COLORTERM is not truecolor.
 * Visual hierarchy preserved with closest palette indices.
 */
const ANSI256_TOKENS: Readonly<ThemeTokens> = Object.freeze({
  primary:         A256_PRIMARY,
  success:         A256_SUCCESS,
  warning:         A256_WARNING,
  error:           A256_ERROR,
  muted:           A256_MUTED,
  surface:         A256_SURFACE,
  border:          A256_BORDER,
  diffAddedBg:     A256_DIFF_ADDED_BG,
  diffRemovedBg:   A256_DIFF_REMOVED_BG,
  diffAddedText:   A256_DIFF_ADDED_TEXT,
  diffRemovedText: A256_DIFF_REMOVED_TEXT,
  diffHunkHeader:  A256_DIFF_HUNK_HEADER,
});

/**
 * ANSI 16-color theme tokens.
 * Used when TERM is basic (linux, xterm, dumb) or NO_COLOR is set.
 * Maps to the 8 standard + 8 bright ANSI colors.
 */
const ANSI16_TOKENS: Readonly<ThemeTokens> = Object.freeze({
  primary:         A16_PRIMARY,
  success:         A16_SUCCESS,
  warning:         A16_WARNING,
  error:           A16_ERROR,
  muted:           A16_MUTED,
  surface:         A16_SURFACE,
  border:          A16_BORDER,
  diffAddedBg:     A16_DIFF_ADDED_BG,
  diffRemovedBg:   A16_DIFF_REMOVED_BG,
  diffAddedText:   A16_DIFF_ADDED_TEXT,
  diffRemovedText: A16_DIFF_REMOVED_TEXT,
  diffHunkHeader:  A16_DIFF_HUNK_HEADER,
});
```

### Step 4: Implement the `createTheme()` factory function

**File:** `apps/tui/src/theme/tokens.ts` (continued)

```typescript
/**
 * Create a theme for the given color tier.
 *
 * Returns a frozen ThemeTokens object with pre-allocated RGBA instances.
 * The returned object is always the same identity for the same tier —
 * calling createTheme("truecolor") twice returns the same object.
 *
 * @param tier - The detected terminal color capability tier.
 * @returns A frozen ThemeTokens object. Never null.
 */
export function createTheme(tier: ColorTier): Readonly<ThemeTokens> {
  switch (tier) {
    case "truecolor":
      return TRUECOLOR_TOKENS;
    case "ansi256":
      return ANSI256_TOKENS;
    case "ansi16":
      return ANSI16_TOKENS;
  }
}
```

**Design rationale:**
- `createTheme()` returns pre-built frozen objects rather than constructing new ones. This guarantees identity stability — the same tier always returns the same object reference.
- The `switch` is exhaustive over the `ColorTier` union. TypeScript's control-flow analysis ensures no tier is missed.
- The function is named `createTheme` (not `getTheme`) to match the engineering architecture spec's terminology.

### Step 5: Define `TextAttributes`

**File:** `apps/tui/src/theme/tokens.ts` (continued)

Text attributes (bold, dim, underline, reverse) are tier-independent. They use numeric attribute flags compatible with OpenTUI.

```typescript
/**
 * Text attribute constants for semantic styling.
 *
 * These are terminal-capability-independent — all tiers support
 * bold, dim, underline, and reverse attributes via SGR sequences.
 *
 * Usage: pass to OpenTUI component `attributes` prop as bitwise OR.
 * Example: attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE}
 */
export const TextAttributes = Object.freeze({
  /** Headings, focused item labels, strong emphasis */
  BOLD: 1 << 0,       // SGR 1
  /** Muted helper text, disabled items */
  DIM: 1 << 1,        // SGR 2
  /** Links in markdown content */
  UNDERLINE: 1 << 2,  // SGR 4
  /** Focused list row highlight (alternative to colored background) */
  REVERSE: 1 << 3,    // SGR 7
} as const);

/** Type for individual text attribute flags */
export type TextAttribute = (typeof TextAttributes)[keyof typeof TextAttributes];
```

### Step 6: Implement `statusToToken()` utility

**File:** `apps/tui/src/theme/tokens.ts` (continued)

```typescript
/**
 * Semantic token names. Used as keys into ThemeTokens.
 */
export type SemanticTokenName = keyof ThemeTokens;

/**
 * Core token names (excluding diff tokens).
 * These are the tokens commonly resolved from entity status strings.
 */
export type CoreTokenName = "primary" | "success" | "warning" | "error" | "muted" | "surface" | "border";

/**
 * Map an entity state string to a semantic token name.
 *
 * Covers common states across issues, landings, checks, workspaces,
 * workflows, and sync status. Unknown states fall back to "muted".
 *
 * @param status - The entity state string from the API (case-insensitive).
 * @returns The semantic token name to use for coloring.
 */
export function statusToToken(status: string): CoreTokenName {
  switch (status.toLowerCase()) {
    // ── Success states ──────────────────────────────────────────────
    case "open":
    case "active":
    case "running":
    case "passed":
    case "success":
    case "connected":
    case "ready":
    case "merged":
    case "completed":
      return "success";

    // ── Warning states ──────────────────────────────────────────────
    case "pending":
    case "draft":
    case "queued":
    case "syncing":
    case "in_progress":
    case "waiting":
    case "conflict":
    case "suspended":
    case "paused":
      return "warning";

    // ── Error states ────────────────────────────────────────────────
    case "closed":
    case "rejected":
    case "failed":
    case "error":
    case "disconnected":
    case "cancelled":
    case "timed_out":
    case "stopped":
      return "error";

    // ── Primary states (informational/interactive) ──────────────────
    case "focused":
    case "selected":
    case "current":
      return "primary";

    // ── Default fallback ────────────────────────────────────────────
    default:
      return "muted";
  }
}
```

### Step 7: Export the public API

**File:** `apps/tui/src/theme/tokens.ts` (continued)

```typescript
// ── Named constant exports for direct token access ────────────────────
export { TRUECOLOR_TOKENS, ANSI256_TOKENS, ANSI16_TOKENS };

/** Total number of semantic tokens in the theme */
export const THEME_TOKEN_COUNT = 12;
```

### Step 8: Update theme barrel export

**File:** `apps/tui/src/theme/index.ts`

Add the new `tokens.ts` exports to the barrel file:

```typescript
export { type ColorTier, detectColorCapability, isUnicodeSupported } from "./detect.js";
export { defaultSyntaxStyle } from "./syntaxStyle.js";
export {
  type ThemeTokens,
  type SemanticTokenName,
  type CoreTokenName,
  type TextAttribute,
  TextAttributes,
  createTheme,
  statusToToken,
  TRUECOLOR_TOKENS,
  ANSI256_TOKENS,
  ANSI16_TOKENS,
  THEME_TOKEN_COUNT,
} from "./tokens.js";
```

---

## File Inventory

| File | Action | Purpose |
|------|--------|--------|
| `apps/tui/src/theme/tokens.ts` | **Create** | All token interfaces, RGBA constants, frozen token objects, `createTheme()`, `TextAttributes`, `statusToToken()` |
| `apps/tui/src/theme/index.ts` | **Update** | Add re-exports from `tokens.ts` |
| `e2e/tui/app-shell.test.ts` | **Update** | Add theme token unit tests |

---

## API Surface

| Export | Kind | Description |
|--------|------|-------------|
| `ThemeTokens` | Type/Interface | Shape of a resolved theme (12 `RGBA` properties) |
| `SemanticTokenName` | Type | `keyof ThemeTokens` — union of all 12 token names |
| `CoreTokenName` | Type | Union of the 7 non-diff token names |
| `TextAttribute` | Type | Numeric attribute flag type |
| `TextAttributes` | Frozen object | `{ BOLD, DIM, UNDERLINE, REVERSE }` — bitwise attribute flags |
| `createTheme(tier)` | Function | Returns `Readonly<ThemeTokens>` for the given `ColorTier` |
| `statusToToken(status)` | Function | Maps entity state strings to `CoreTokenName` |
| `TRUECOLOR_TOKENS` | Frozen object | Pre-built truecolor theme |
| `ANSI256_TOKENS` | Frozen object | Pre-built ANSI 256 theme |
| `ANSI16_TOKENS` | Frozen object | Pre-built ANSI 16 theme |
| `THEME_TOKEN_COUNT` | Constant | `12` |

---

## Invariants

1. **No per-render allocation.** All `RGBA` instances are module-level constants. `createTheme()` returns pre-built frozen objects. No `new Float32Array()` calls happen at render time.

2. **Identity stability.** `createTheme("truecolor") === createTheme("truecolor")` — same tier returns the same object reference. React components that depend on token identity for memoization can rely on this.

3. **Immutability.** All token objects are `Object.freeze()`-d. Attempting to set `tokens.primary = ...` throws in strict mode and silently fails otherwise. Note: `RGBA` instances themselves are not frozen (their `Float32Array` buffer is mutable), but since they are module-scoped constants, no code path should mutate them.

4. **Exhaustive tier coverage.** The `createTheme()` switch is exhaustive over `ColorTier`. If a new tier is added to `detect.ts`, TypeScript will produce a compile error until `tokens.ts` is updated.

5. **Closed token set.** The `ThemeTokens` interface is a fixed set of 12 tokens. No dynamic token creation at runtime. The type system enforces this at compile time.

6. **No React dependency.** `tokens.ts` imports only `RGBA` from `@opentui/core` and `ColorTier` from `./detect.js`. It has zero React imports.

7. **No API dependency.** Token values are hardcoded constants. No network calls, no authentication.

---

## Productionization Notes

### From colors.ts (Agent screen) to tokens.ts

The existing `apps/tui/src/screens/Agents/components/colors.ts` already defines a subset of these tokens (6 of the 12) with the same values. After this ticket lands:

1. A follow-up migration ticket should update `colors.ts` to import from `tokens.ts`.
2. Eventually, when `ThemeProvider` is implemented, `colors.ts` should be deleted entirely and Agent components should consume `useTheme()`.

### Value alignment verification

The ANSI 256 RGB values in this spec must exactly match those in `screens/Agents/components/colors.ts` for the 6 overlapping tokens (`primary`, `success`, `warning`, `error`, `muted`, `border`). This is verified by test `TOKEN-COMPAT-001`.

### RGBA buffer mutability caveat

`RGBA` objects use `Float32Array` buffers internally. While our token objects are `Object.freeze()`-d, the RGBA instances' internal buffers are technically mutable. If a component ever did `theme.primary.r = 0.5`, it would corrupt the shared constant. This is mitigated by: all token RGBA instances being module-scoped `const`, the `ThemeTokens` interface using `readonly` modifiers, and a runtime guard test (`TOKEN-GUARD-001`) verifying that token values survive a full render cycle unchanged.

### ANSI 256 Index 245 Discrepancy

The existing `colors.ts` uses `RGBA.fromInts(168, 168, 168)` for muted (commenting it as ANSI 245), but the standard xterm-256color palette maps index 245 to `(138, 138, 138)`. The value `(168, 168, 168)` corresponds to ANSI 248. For correctness, `tokens.ts` uses the true index 245 value `(138, 138, 138)`. The `TOKEN-COMPAT-001` test will detect the discrepancy with `colors.ts`, and the migration ticket will align both files.

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All tests are appended inside a new `describe("TUI_APP_SHELL — Theme token definitions", () => { ... })` block. Tests import the token module directly via `bunEval` for pure function validation.

#### Structure & Type Tests

- **TOKEN-STRUCT-001**: `createTheme returns object with all 12 semantic tokens` — Verify all 12 token names present in returned object.
- **TOKEN-STRUCT-002**: `all token values are RGBA instances with Float32Array buffers` — Verify every value has a Float32Array buffer of length 4.
- **TOKEN-STRUCT-003**: `THEME_TOKEN_COUNT equals 12` — Verify the constant.

#### Immutability Tests

- **TOKEN-FREEZE-001**: `createTheme returns a frozen object` — `Object.isFrozen()` returns true.
- **TOKEN-FREEZE-002**: `all three tier token objects are frozen` — Verify TRUECOLOR_TOKENS, ANSI256_TOKENS, ANSI16_TOKENS are all frozen.
- **TOKEN-FREEZE-003**: `adding a property to frozen theme throws or silently fails` — Attempt to add property, verify it doesn't exist.

#### Identity Stability Tests

- **TOKEN-IDENTITY-001**: `createTheme returns same reference for same tier` — `createTheme("truecolor") === createTheme("truecolor")`.
- **TOKEN-IDENTITY-002**: `createTheme returns different references for different tiers` — All three tiers produce different objects.
- **TOKEN-IDENTITY-003**: `RGBA instances within a tier are reused by identity across calls` — Same RGBA object reference between calls.

#### Truecolor Value Tests

- **TOKEN-TC-001**: `truecolor primary is #2563EB` — Verify RGB integers (37, 99, 235, 255).
- **TOKEN-TC-002**: `truecolor diff tokens match spec hex values` — Verify all 5 diff token RGB values.

#### ANSI 256 Value Tests

- **TOKEN-256-001**: `ansi256 tokens use correct palette RGB values` — Verify all 7 core token RGB values against xterm-256color palette.

#### ANSI 16 Value Tests

- **TOKEN-16-001**: `ansi16 primary is basic blue` — Verify (0, 0, 255, 255).
- **TOKEN-16-002**: `ansi16 has all 12 tokens defined (no undefined/null)` — No missing values.

#### statusToToken Tests

- **TOKEN-STATUS-001**: `statusToToken maps success states correctly` — 9 success states all return "success".
- **TOKEN-STATUS-002**: `statusToToken maps warning states correctly` — 9 warning states all return "warning".
- **TOKEN-STATUS-003**: `statusToToken maps error states correctly` — 8 error states all return "error".
- **TOKEN-STATUS-004**: `statusToToken is case-insensitive` — Mixed case inputs resolve correctly.
- **TOKEN-STATUS-005**: `statusToToken returns 'muted' for unknown states` — Unknown strings fall back to "muted".

#### TextAttributes Tests

- **TOKEN-ATTR-001**: `TextAttributes contains BOLD, DIM, UNDERLINE, REVERSE` — All four present as numbers, object frozen.
- **TOKEN-ATTR-002**: `TextAttributes flags are distinct powers of two for bitwise OR` — All values are powers of 2, all unique, combinable.

#### Compatibility Tests

- **TOKEN-COMPAT-001**: `ansi256 core tokens match existing Agent colors.ts values` — Verify 6 overlapping tokens match.
- **TOKEN-COMPAT-002**: `truecolor core tokens match existing Agent colors.ts values` — Verify 6 overlapping tokens match.

#### Guard Tests

- **TOKEN-GUARD-001**: `RGBA values are not corrupted after multiple reads` — Read token values 1000 times, verify unchanged.

#### Exhaustive Tier Tests

- **TOKEN-EXHAUST-001**: `createTheme handles all three tiers without throwing` — All tiers return 12 tokens.

#### Cross-tier Differentiation Tests

- **TOKEN-DIFF-001**: `primary token differs across all three tiers` — No two tiers share the same primary RGB value.

**Total: 26 tests.** All tests use `bunEval` to run against the actual module. No mocking. Tests that fail due to unimplemented backends are left failing per repository policy.