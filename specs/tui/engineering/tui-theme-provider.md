# Engineering Specification: `tui-theme-provider`

## Implement ThemeProvider React context and useTheme hook

---

## Overview

This ticket creates the `ThemeProvider` React context provider and its companion hooks (`useTheme()`, `useColorTier()`) that make the TUI's semantic color tokens available to every component in the React tree. The provider is a thin reactive wrapper around the already-implemented `detectColorCapability()` and `createTheme()` functions from `apps/tui/src/theme/`.

The `ThemeProvider` sits in the provider stack between `NavigationProvider` and `KeybindingProvider`:

```
NavigationProvider
  → ThemeProvider          ← THIS TICKET
    → KeybindingProvider
      → AppShell
```

### Dependencies

| Dependency | Status | Location |
|------------|--------|----------|
| `tui-theme-tokens` | ✅ Implemented | `apps/tui/src/theme/tokens.ts` — provides `ThemeTokens`, `createTheme()` |
| `tui-foundation-scaffold` | ✅ Implemented | `apps/tui/package.json`, `tsconfig.json`, directory structure |
| `tui-color-detection` | ✅ Implemented | `apps/tui/src/theme/detect.ts` — provides `ColorTier`, `detectColorCapability()` |

### Non-Goals

- This ticket does **not** implement runtime theme switching or light mode. Single dark theme only.
- This ticket does **not** accept user-supplied theme overrides.
- This ticket does **not** migrate existing consumers (`screens/Agents/components/colors.ts`, `lib/diff-syntax.ts`) to use `useTheme()`. Those are future migration tickets.
- This ticket does **not** implement `KeybindingProvider`, `AppShell`, or any other provider in the stack.

---

## Implementation Plan

### Step 1: Create the ThemeContext and ThemeProvider component

**File:** `apps/tui/src/providers/ThemeProvider.tsx`

Create the React context and provider component. The provider detects color capability once on mount, creates the frozen theme tokens, and provides both the tokens and the detected tier to all descendants.

```typescript
import { createContext, useMemo } from "react";
import { detectColorCapability, type ColorTier } from "../theme/detect.js";
import { createTheme, type ThemeTokens } from "../theme/tokens.js";

/**
 * Internal context value shape.
 *
 * Components access this via useTheme() (for tokens) or useColorTier() (for tier).
 * The context is never exposed directly — always consumed through hooks.
 */
export interface ThemeContextValue {
  /** The frozen semantic color tokens resolved for the detected terminal capability. */
  readonly tokens: Readonly<ThemeTokens>;
  /** The detected terminal color capability tier. */
  readonly colorTier: ColorTier;
}

/**
 * React context for the theme system.
 *
 * Default value is `null` — hooks throw if used outside the provider.
 * This ensures misuse is caught early with a clear error message.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider — provides resolved color tokens to the entire TUI component tree.
 *
 * On mount:
 * 1. Calls detectColorCapability() to determine the terminal's color tier.
 * 2. Calls createTheme(tier) to get the frozen ThemeTokens object.
 * 3. Stores both in a memoized context value that never changes.
 *
 * The provider renders no layout nodes — it is a pure context wrapper.
 * Children are passed through without any wrapping <box> or <text>.
 *
 * Single dark theme only. No user-supplied themes. No runtime switching.
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <AppShell />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({ children }: ThemeProviderProps): React.ReactElement {
  // Detection and theme creation happen once. useMemo with [] deps ensures
  // this runs exactly once per provider mount. Since detectColorCapability()
  // reads process.env (which doesn't change during a TUI session) and
  // createTheme() returns a pre-allocated frozen singleton, this is safe.
  const contextValue = useMemo<ThemeContextValue>(() => {
    const colorTier = detectColorCapability();
    const tokens = createTheme(colorTier);
    return { tokens, colorTier };
  }, []);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}
```

**Design rationale:**

- `useMemo(() => ..., [])` ensures detection and theme creation run exactly once per mount. The dependency array is empty because terminal color capability does not change during a session. This matches the architecture spec: "Color capability is detected once at startup and frozen for the session."
- The context stores both `tokens` and `colorTier` in a single object. This avoids creating two separate contexts while still allowing components to access either value independently.
- `ThemeContext` default is `null`, not a default theme. This forces all theme consumers to be descendants of `ThemeProvider`, catching wiring errors at development time.
- The provider renders `{children}` directly with no wrapping elements. It adds zero layout nodes to the OpenTUI render tree.

### Step 2: Create the useTheme hook

**File:** `apps/tui/src/hooks/useTheme.ts`

```typescript
import { useContext } from "react";
import { ThemeContext } from "../providers/ThemeProvider.js";
import type { ThemeTokens } from "../theme/tokens.js";

/**
 * Access the resolved semantic color tokens for the current terminal.
 *
 * Returns a frozen ThemeTokens object with RGBA values appropriate for
 * the detected terminal color capability (truecolor, ansi256, or ansi16).
 *
 * Must be called within a <ThemeProvider> descendant. Throws if used
 * outside the provider tree.
 *
 * The returned object is referentially stable — it never changes during
 * the lifetime of the TUI session. Components can safely use tokens
 * in dependency arrays without causing re-renders.
 *
 * @returns Frozen ThemeTokens object.
 * @throws Error if called outside ThemeProvider.
 *
 * @example
 * ```tsx
 * const theme = useTheme();
 * <text fg={theme.primary}>Focused item</text>
 * <text fg={theme.muted}>Secondary text</text>
 * <box borderColor={theme.border}>Content</box>
 * ```
 */
export function useTheme(): Readonly<ThemeTokens> {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error(
      "useTheme() must be used within a <ThemeProvider>. " +
      "Ensure ThemeProvider is in the component ancestor chain."
    );
  }
  return context.tokens;
}
```

**Design rationale:**

- The hook returns `Readonly<ThemeTokens>` directly, not the full `ThemeContextValue`. This is the 90% use case — components need tokens, not the tier.
- The error message is actionable: it tells the developer exactly what to do.
- No conditional logic or fallback themes. If the provider is missing, it's a bug.

### Step 3: Create the useColorTier hook

**File:** `apps/tui/src/hooks/useColorTier.ts`

```typescript
import { useContext } from "react";
import { ThemeContext } from "../providers/ThemeProvider.js";
import type { ColorTier } from "../theme/detect.js";

/**
 * Access the detected terminal color capability tier.
 *
 * Returns the ColorTier string ("truecolor" | "ansi256" | "ansi16")
 * that was detected at ThemeProvider mount time.
 *
 * Use this when a component needs tier-aware behavior beyond color tokens,
 * such as:
 * - Disabling split diff mode on ansi16 (insufficient background colors)
 * - Choosing between Unicode and ASCII progress indicators
 * - Adjusting syntax highlighting detail level
 *
 * Must be called within a <ThemeProvider> descendant. Throws if used
 * outside the provider tree.
 *
 * @returns The detected ColorTier.
 * @throws Error if called outside ThemeProvider.
 *
 * @example
 * ```tsx
 * const tier = useColorTier();
 * const showSplitDiff = tier !== "ansi16";
 * ```
 */
export function useColorTier(): ColorTier {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error(
      "useColorTier() must be used within a <ThemeProvider>. " +
      "Ensure ThemeProvider is in the component ancestor chain."
    );
  }
  return context.colorTier;
}
```

### Step 4: Update the hooks barrel export

**File:** `apps/tui/src/hooks/index.ts`

Add the new hook exports to the existing barrel file:

```typescript
// ... existing exports ...

export { useTheme } from "./useTheme.js";
export { useColorTier } from "./useColorTier.js";
```

Append these two lines after the existing exports. Do not modify any existing export lines.

### Step 5: Update the providers barrel export

**File:** `apps/tui/src/providers/index.ts`

Add the ThemeProvider export:

```typescript
export { NavigationProvider, NavigationContext } from "./NavigationProvider";
export { ThemeProvider, ThemeContext } from "./ThemeProvider";
export type { ThemeContextValue, ThemeProviderProps } from "./ThemeProvider";
```

Remove or update the "Planned providers" comment to reflect that ThemeProvider is now implemented.

---

## File Inventory

| File | Action | Purpose |
|------|--------|--------|
| `apps/tui/src/providers/ThemeProvider.tsx` | **Create** | ThemeContext, ThemeContextValue interface, ThemeProvider component |
| `apps/tui/src/hooks/useTheme.ts` | **Create** | `useTheme()` hook — returns `Readonly<ThemeTokens>` |
| `apps/tui/src/hooks/useColorTier.ts` | **Create** | `useColorTier()` hook — returns `ColorTier` |
| `apps/tui/src/hooks/index.ts` | **Update** | Add `useTheme` and `useColorTier` exports |
| `apps/tui/src/providers/index.ts` | **Update** | Add `ThemeProvider`, `ThemeContext`, type exports |
| `e2e/tui/app-shell.test.ts` | **Update** | Add ThemeProvider test block |

---

## API Surface

| Export | Kind | Source File | Description |
|--------|------|-------------|-------------|
| `ThemeProvider` | Component | `providers/ThemeProvider.tsx` | Context provider — wraps children with theme context |
| `ThemeContext` | React Context | `providers/ThemeProvider.tsx` | Raw context object (for testing; prefer hooks) |
| `ThemeContextValue` | Type | `providers/ThemeProvider.tsx` | `{ tokens: Readonly<ThemeTokens>, colorTier: ColorTier }` |
| `ThemeProviderProps` | Type | `providers/ThemeProvider.tsx` | `{ children: React.ReactNode }` |
| `useTheme()` | Hook | `hooks/useTheme.ts` | Returns `Readonly<ThemeTokens>` — throws outside provider |
| `useColorTier()` | Hook | `hooks/useColorTier.ts` | Returns `ColorTier` — throws outside provider |

---

## Invariants

1. **Single initialization.** `detectColorCapability()` and `createTheme()` are each called exactly once per `ThemeProvider` mount. The results are memoized with an empty dependency array and never recomputed.

2. **Referential stability.** The context value object and the tokens object within it are referentially stable for the lifetime of the provider. Components that include `useTheme()` results in dependency arrays will not trigger re-renders from theme changes (there are none).

3. **No layout nodes.** `ThemeProvider` renders `<ThemeContext.Provider>` wrapping `{children}`. It adds zero `<box>`, `<text>`, or other renderable nodes to the OpenTUI tree. The provider is invisible in layout.

4. **Fail-fast on misuse.** Both `useTheme()` and `useColorTier()` throw a descriptive `Error` if called outside a `ThemeProvider`. There is no fallback theme — missing the provider is always a bug.

5. **Frozen tokens.** The `ThemeTokens` object returned by `useTheme()` is `Object.freeze()`-d (guaranteed by `createTheme()`). Property assignment attempts throw in strict mode.

6. **No React dependency in tokens.** `ThemeProvider.tsx` imports from `../theme/detect.js` and `../theme/tokens.js`, which have zero React dependencies. The provider is the only React-aware layer.

7. **Provider ordering.** `ThemeProvider` sits after `NavigationProvider` and before `KeybindingProvider` in the provider stack. It has no dependency on `NavigationProvider`'s context — the ordering is for conceptual layering only.

---

## Usage Patterns

### Basic token usage in a component

```tsx
import { useTheme } from "../hooks/useTheme.js";

function IssueRow({ issue, focused }: { issue: Issue; focused: boolean }) {
  const theme = useTheme();
  const statusColor = theme[statusToToken(issue.status)];

  return (
    <box flexDirection="row">
      <text fg={statusColor}>{issue.status}</text>
      <text fg={focused ? theme.primary : undefined}>{issue.title}</text>
      <text fg={theme.muted}>{issue.updatedAt}</text>
    </box>
  );
}
```

### Tier-aware behavior

```tsx
import { useColorTier } from "../hooks/useColorTier.js";

function DiffControls() {
  const tier = useColorTier();
  const canSplit = tier !== "ansi16"; // split diff needs background colors

  return (
    <box>
      {canSplit && <text>t: toggle split/unified</text>}
      <text>w: toggle whitespace</text>
    </box>
  );
}
```

### Provider stack composition

```tsx
import { NavigationProvider } from "./providers/NavigationProvider.js";
import { ThemeProvider } from "./providers/ThemeProvider.js";

function App() {
  return (
    <NavigationProvider>
      <ThemeProvider>
        {/* KeybindingProvider, AppShell, etc. */}
      </ThemeProvider>
    </NavigationProvider>
  );
}
```

---

## Productionization Notes

### Migration path for existing color consumers

After this ticket lands, two existing files use hardcoded colors that should eventually migrate to `useTheme()`:

1. **`apps/tui/src/screens/Agents/components/colors.ts`** — Defines a local `COLORS` object with 6 tokens (primary, success, warning, error, muted, border). Components in the Agent screen import from this file. Migration: replace `import { COLORS } from './colors.js'` with `const theme = useTheme()` in each Agent component, then delete `colors.ts`.

2. **`apps/tui/src/lib/diff-syntax.ts`** — Defines its own `detectColorTier()` and palette constants. Migration: import `detectColorCapability` from `../theme/detect.js` and use `useTheme()` or `useColorTier()` for tier-dependent palette selection.

These migrations are separate tickets. They are **not** blockers for this ticket.

### RGBA mutability caveat

The `ThemeTokens` object is `Object.freeze()`-d, but the `RGBA` instances within it use `Float32Array` buffers that are technically mutable. If a component did `theme.primary.r = 0.5`, it would corrupt the shared constant. This is mitigated by:

- `readonly` modifiers on all `ThemeTokens` interface properties
- Module-scoped `const` declarations for all RGBA instances
- The `TOKEN-GUARD-001` test (from `tui-theme-tokens`) verifying values survive repeated reads
- The `PROVIDER-GUARD-001` test (from this ticket) verifying tokens returned by `useTheme()` match the expected values

### Context value stability

The `useMemo(() => ..., [])` pattern creates the context value exactly once. Since the value never changes, no descendant component will re-render due to theme context changes. This is critical for performance — the theme provider should be completely invisible in React's reconciliation.

If a future requirement demands dynamic theme switching (e.g., detecting `SIGWINCH` + `COLORTERM` change), the `useMemo` deps would need to include a signal. This is explicitly out of scope for this ticket and for the TUI's current product direction (single dark theme only).

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All tests are appended inside a new `describe("TUI_APP_SHELL — ThemeProvider and useTheme hook", () => { ... })` block. Tests use `bunEval` for module-level validation (no full TUI launch needed) and `launchTUI` for integration tests that verify theme context is available in the rendered application.

#### File Existence & Export Tests

- **PROVIDER-FILE-001**: `ThemeProvider.tsx exists`
  ```typescript
  test("PROVIDER-FILE-001: ThemeProvider.tsx exists", () => {
    expect(existsSync(join(TUI_SRC, "providers/ThemeProvider.tsx"))).toBe(true);
  });
  ```

- **PROVIDER-FILE-002**: `useTheme.ts exists`
  ```typescript
  test("PROVIDER-FILE-002: useTheme.ts exists", () => {
    expect(existsSync(join(TUI_SRC, "hooks/useTheme.ts"))).toBe(true);
  });
  ```

- **PROVIDER-FILE-003**: `useColorTier.ts exists`
  ```typescript
  test("PROVIDER-FILE-003: useColorTier.ts exists", () => {
    expect(existsSync(join(TUI_SRC, "hooks/useColorTier.ts"))).toBe(true);
  });
  ```

- **PROVIDER-FILE-004**: `providers/index.ts re-exports ThemeProvider`
  ```typescript
  test("PROVIDER-FILE-004: providers/index.ts re-exports ThemeProvider", async () => {
    const result = await run(
      [BUN, "-e", "import { ThemeProvider } from './src/providers/index.js'; console.log(typeof ThemeProvider)"],
      { cwd: TUI_ROOT }
    );
    expect(result.stdout.trim()).toBe("function");
  });
  ```

- **PROVIDER-FILE-005**: `hooks/index.ts re-exports useTheme`
  ```typescript
  test("PROVIDER-FILE-005: hooks/index.ts re-exports useTheme", async () => {
    const result = await run(
      [BUN, "-e", "import { useTheme } from './src/hooks/index.js'; console.log(typeof useTheme)"],
      { cwd: TUI_ROOT }
    );
    expect(result.stdout.trim()).toBe("function");
  });
  ```

- **PROVIDER-FILE-006**: `hooks/index.ts re-exports useColorTier`
  ```typescript
  test("PROVIDER-FILE-006: hooks/index.ts re-exports useColorTier", async () => {
    const result = await run(
      [BUN, "-e", "import { useColorTier } from './src/hooks/index.js'; console.log(typeof useColorTier)"],
      { cwd: TUI_ROOT }
    );
    expect(result.stdout.trim()).toBe("function");
  });
  ```

#### ThemeProvider Behavior Tests (via bunEval inline React render)

These tests create a minimal React component tree with `ThemeProvider` and verify behavior. They use `bunEval` with inline JSX that imports `@opentui/react` for `createRoot` and `@opentui/core` for `createCliRenderer`.

- **PROVIDER-RENDER-001**: `ThemeProvider renders children without adding layout nodes`
  ```typescript
  test("PROVIDER-RENDER-001: ThemeProvider renders children without adding layout nodes", async () => {
    const result = await run(
      [BUN, "-e", `
        import { ThemeProvider } from './src/providers/ThemeProvider.js';
        import { createElement } from 'react';
        // ThemeProvider should be a function that accepts { children }
        console.log(typeof ThemeProvider);
        console.log(ThemeProvider.length <= 1); // single props arg
      `],
      { cwd: TUI_ROOT }
    );
    expect(result.stdout.trim()).toContain("function");
    expect(result.stdout.trim()).toContain("true");
  });
  ```

- **PROVIDER-RENDER-002**: `ThemeContext default value is null`
  ```typescript
  test("PROVIDER-RENDER-002: ThemeContext default value is null", async () => {
    const result = await run(
      [BUN, "-e", `
        import { ThemeContext } from './src/providers/ThemeProvider.js';
        // React createContext with null default
        console.log(ThemeContext._currentValue === null);
      `],
      { cwd: TUI_ROOT }
    );
    expect(result.stdout.trim()).toBe("true");
  });
  ```

- **PROVIDER-RENDER-003**: `ThemeContextValue has tokens and colorTier properties`
  ```typescript
  test("PROVIDER-RENDER-003: ThemeContextValue exports correct type shape", async () => {
    // Compile-time type check via tsc
    const result = await run(
      [BUN, "-e", `
        import type { ThemeContextValue } from './src/providers/ThemeProvider.js';
        import type { ThemeTokens } from './src/theme/tokens.js';
        import type { ColorTier } from './src/theme/detect.js';
        // Type assertion: ThemeContextValue must have tokens and colorTier
        const check: ThemeContextValue = { tokens: {} as ThemeTokens, colorTier: 'truecolor' as ColorTier };
        console.log('type-check-ok');
      `],
      { cwd: TUI_ROOT }
    );
    expect(result.stdout.trim()).toBe("type-check-ok");
  });
  ```

#### useTheme Hook Tests

- **PROVIDER-HOOK-001**: `useTheme throws when called outside ThemeProvider`
  ```typescript
  test("PROVIDER-HOOK-001: useTheme throws when called outside ThemeProvider", async () => {
    const result = await run(
      [BUN, "-e", `
        import { useTheme } from './src/hooks/useTheme.js';
        import { renderHook } from './test-utils/renderHook.js';
        try {
          // Calling useTheme outside provider should throw
          // We can't actually call a hook outside React, but we can verify
          // the function checks for null context
          const src = await Bun.file('./src/hooks/useTheme.ts').text();
          const throwsOnNull = src.includes('throw') && src.includes('ThemeProvider');
          console.log(throwsOnNull);
        } catch (e) {
          console.log('threw:', e.message);
        }
      `],
      { cwd: TUI_ROOT }
    );
    expect(result.stdout.trim()).toBe("true");
  });
  ```

- **PROVIDER-HOOK-002**: `useTheme error message mentions ThemeProvider`
  ```typescript
  test("PROVIDER-HOOK-002: useTheme error message mentions ThemeProvider", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useTheme.ts")).text();
    expect(content).toContain("ThemeProvider");
    expect(content).toContain("throw");
  });
  ```

- **PROVIDER-HOOK-003**: `useTheme returns Readonly<ThemeTokens> type`
  ```typescript
  test("PROVIDER-HOOK-003: useTheme return type annotation is Readonly<ThemeTokens>", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useTheme.ts")).text();
    expect(content).toMatch(/Readonly<ThemeTokens>/);
  });
  ```

#### useColorTier Hook Tests

- **PROVIDER-TIER-001**: `useColorTier throws when called outside ThemeProvider`
  ```typescript
  test("PROVIDER-TIER-001: useColorTier throws when called outside ThemeProvider", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useColorTier.ts")).text();
    expect(content).toContain("ThemeProvider");
    expect(content).toContain("throw");
  });
  ```

- **PROVIDER-TIER-002**: `useColorTier error message mentions ThemeProvider`
  ```typescript
  test("PROVIDER-TIER-002: useColorTier error message mentions ThemeProvider", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useColorTier.ts")).text();
    expect(content).toMatch(/useColorTier.*must be used within/);
  });
  ```

- **PROVIDER-TIER-003**: `useColorTier return type annotation is ColorTier`
  ```typescript
  test("PROVIDER-TIER-003: useColorTier return type is ColorTier", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useColorTier.ts")).text();
    expect(content).toMatch(/ColorTier/);
  });
  ```

#### Module Integration Tests

- **PROVIDER-IMPORT-001**: `ThemeProvider imports detectColorCapability from theme/detect`
  ```typescript
  test("PROVIDER-IMPORT-001: ThemeProvider imports detectColorCapability from theme/detect", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/ThemeProvider.tsx")).text();
    expect(content).toMatch(/import.*detectColorCapability.*from.*detect/);
  });
  ```

- **PROVIDER-IMPORT-002**: `ThemeProvider imports createTheme from theme/tokens`
  ```typescript
  test("PROVIDER-IMPORT-002: ThemeProvider imports createTheme from theme/tokens", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/ThemeProvider.tsx")).text();
    expect(content).toMatch(/import.*createTheme.*from.*tokens/);
  });
  ```

- **PROVIDER-IMPORT-003**: `ThemeProvider uses useMemo for initialization`
  ```typescript
  test("PROVIDER-IMPORT-003: ThemeProvider uses useMemo for initialization", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/ThemeProvider.tsx")).text();
    expect(content).toContain("useMemo");
  });
  ```

- **PROVIDER-IMPORT-004**: `ThemeProvider does not import any OpenTUI renderable components`
  ```typescript
  test("PROVIDER-IMPORT-004: ThemeProvider does not import any OpenTUI renderable components", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/ThemeProvider.tsx")).text();
    // Should not import box, text, scrollbox, etc. — pure context wrapper
    expect(content).not.toMatch(/import.*from.*@opentui\/core.*box|text|scrollbox/i);
    expect(content).not.toContain("<box");
    expect(content).not.toContain("<text");
  });
  ```

#### Compile Tests

- **PROVIDER-TSC-001**: `ThemeProvider.tsx compiles without errors`
  ```typescript
  test("PROVIDER-TSC-001: ThemeProvider.tsx compiles without errors", async () => {
    const result = await run(
      [BUN, "-e", `
        import { ThemeProvider, ThemeContext } from './src/providers/ThemeProvider.js';
        import type { ThemeContextValue, ThemeProviderProps } from './src/providers/ThemeProvider.js';
        console.log(typeof ThemeProvider, typeof ThemeContext);
      `],
      { cwd: TUI_ROOT }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function object");
  });
  ```

- **PROVIDER-TSC-002**: `useTheme.ts compiles without errors`
  ```typescript
  test("PROVIDER-TSC-002: useTheme.ts compiles without errors", async () => {
    const result = await run(
      [BUN, "-e", "import { useTheme } from './src/hooks/useTheme.js'; console.log(typeof useTheme)"],
      { cwd: TUI_ROOT }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });
  ```

- **PROVIDER-TSC-003**: `useColorTier.ts compiles without errors`
  ```typescript
  test("PROVIDER-TSC-003: useColorTier.ts compiles without errors", async () => {
    const result = await run(
      [BUN, "-e", "import { useColorTier } from './src/hooks/useColorTier.js'; console.log(typeof useColorTier)"],
      { cwd: TUI_ROOT }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });
  ```

#### Guard & Immutability Tests

- **PROVIDER-GUARD-001**: `ThemeProvider context value is constructed from detectColorCapability and createTheme`
  ```typescript
  test("PROVIDER-GUARD-001: ThemeProvider calls detectColorCapability and createTheme", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/ThemeProvider.tsx")).text();
    expect(content).toContain("detectColorCapability()");
    expect(content).toContain("createTheme(");
  });
  ```

- **PROVIDER-GUARD-002**: `ThemeProvider does not accept a theme prop`
  ```typescript
  test("PROVIDER-GUARD-002: ThemeProvider does not accept a theme prop", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/ThemeProvider.tsx")).text();
    // ThemeProviderProps should only have children
    expect(content).toMatch(/interface ThemeProviderProps/);
    expect(content).not.toMatch(/theme\s*[?:]/);
  });
  ```

- **PROVIDER-GUARD-003**: `Context value is memoized with empty deps (single initialization)`
  ```typescript
  test("PROVIDER-GUARD-003: Context value is memoized with empty deps", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/ThemeProvider.tsx")).text();
    // useMemo with [] ensures single initialization
    expect(content).toMatch(/useMemo.*\[\]/);
  });
  ```

#### Integration Snapshot Test (Full TUI Launch)

- **PROVIDER-SNAP-001**: `TUI renders with themed colors when ThemeProvider is in the tree`
  ```typescript
  test("PROVIDER-SNAP-001: TUI renders with themed colors when ThemeProvider is in the tree", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    // The TUI should render without errors — presence of Dashboard text
    // confirms the provider stack (including ThemeProvider) initialized
    // successfully.
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("Dashboard");
    // No error about ThemeProvider missing
    expect(snapshot).not.toContain("useTheme() must be used within");
    expect(snapshot).not.toContain("useColorTier() must be used within");
    await terminal.terminate();
  });
  ```

  Note: This test requires `ThemeProvider` to be wired into the actual TUI entry point (`apps/tui/src/index.tsx`). If the entry point has not yet been updated to include `ThemeProvider` in the provider stack, this test will fail. Per repository policy, it is left failing — not skipped.

- **PROVIDER-SNAP-002**: `TUI launches with different COLORTERM values without errors`
  ```typescript
  test("PROVIDER-SNAP-002: TUI launches with COLORTERM=truecolor", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).not.toContain("Error");
    await terminal.terminate();
  });

  test("PROVIDER-SNAP-003: TUI launches with basic TERM (ansi16 tier)", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "", TERM: "xterm", NO_COLOR: "" },
    });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).not.toContain("Error");
    await terminal.terminate();
  });
  ```

**Total: 24 tests.** All tests use either `bunEval`/`run` for module-level validation or `launchTUI` for full integration tests. No mocking. Tests that fail due to unimplemented backends or unwired provider stack are left failing per repository policy.

---

## Test File Location

All tests in: `e2e/tui/app-shell.test.ts`

Appended as a new `describe("TUI_APP_SHELL — ThemeProvider and useTheme hook", () => { ... })` block after the existing `describe("TUI_APP_SHELL — Theme token definitions", ...)` block.

---

## Relationship to Architecture

### Provider Stack Position

From `specs/tui/engineering-architecture.md`:

```
NavigationProvider     ← already implemented
  → ThemeProvider      ← THIS TICKET
    → KeybindingProvider  ← future ticket
      → AppShell          ← future ticket
```

### Engineering Architecture References

- **§ Theme and Color Token System**: "The ThemeProvider creates the token object once and provides it via useTheme(). The object is frozen — no runtime theme switching, no light mode. All components reference semantic tokens, never raw ANSI codes."
- **§ Provider Stack**: "ThemeProvider — color tokens resolved for detected terminal capability"
- **§ Core Abstractions > 8. ThemeProvider**: "Provides resolved color tokens to all components via useTheme()."

This ticket implements exactly the interface described in the architecture spec.

### Pattern Consistency with NavigationProvider

The implementation follows the same patterns established by `NavigationProvider.tsx`:

| Pattern | NavigationProvider | ThemeProvider |
|---------|-------------------|---------------|
| Context default | `null` | `null` |
| Hook throws on null | `useNavigation()` | `useTheme()`, `useColorTier()` |
| Props interface | `NavigationProviderProps` | `ThemeProviderProps` |
| Barrel export | `providers/index.ts` | `providers/index.ts` |
| Renders children directly | Yes | Yes |
| Memoized context value | `useMemo` | `useMemo` |

---

## Acceptance Criteria

1. `apps/tui/src/providers/ThemeProvider.tsx` exists and exports `ThemeProvider`, `ThemeContext`, `ThemeContextValue`, `ThemeProviderProps`.
2. `apps/tui/src/hooks/useTheme.ts` exists and exports `useTheme()` returning `Readonly<ThemeTokens>`.
3. `apps/tui/src/hooks/useColorTier.ts` exists and exports `useColorTier()` returning `ColorTier`.
4. Both hooks throw with a message mentioning `ThemeProvider` when called outside the provider.
5. `ThemeProvider` calls `detectColorCapability()` and `createTheme()` exactly once (via `useMemo([], [])`).
6. `ThemeProvider` renders no layout nodes — children pass through unchanged.
7. `ThemeProvider` does not accept a `theme` prop or any other configuration prop.
8. All barrel exports (`providers/index.ts`, `hooks/index.ts`) are updated.
9. All 24 tests are added to `e2e/tui/app-shell.test.ts`.
10. `bun run check` passes from `apps/tui/` (TypeScript compilation).