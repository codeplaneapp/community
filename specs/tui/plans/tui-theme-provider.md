# Implementation Plan: tui-theme-provider

## Overview
This plan details the implementation of the `ThemeProvider` React context and its companion hooks (`useTheme()` and `useColorTier()`) for the Codeplane TUI. The provider wraps the already-implemented `detectColorCapability()` and `createTheme()` functions, making semantic color tokens available across the TUI component tree. 

## 1. Create ThemeProvider Component
**File:** `apps/tui/src/providers/ThemeProvider.tsx`
- Import `createContext`, `useMemo` from `react`.
- Import `detectColorCapability`, `ColorTier` from `../theme/detect.js`.
- Import `createTheme`, `ThemeTokens` from `../theme/tokens.js`.
- Define `ThemeContextValue` interface (`tokens: Readonly<ThemeTokens>`, `colorTier: ColorTier`).
- Define `ThemeProviderProps` interface (`children: React.ReactNode`).
- Export `ThemeContext` using `createContext<ThemeContextValue | null>(null)`.
- Export `ThemeProvider` component:
  - Use `useMemo(() => { ... }, [])` to call `detectColorCapability()` and `createTheme()` exactly once on mount, caching the frozen result.
  - Return `<ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>` without rendering any `<box>` or UI nodes.

## 2. Create useTheme Hook
**File:** `apps/tui/src/hooks/useTheme.ts`
- Import `useContext` from `react`.
- Import `ThemeContext` from `../providers/ThemeProvider.js`.
- Import `ThemeTokens` from `../theme/tokens.js`.
- Export `useTheme` function:
  - Call `useContext(ThemeContext)`.
  - If context is `null`, throw a descriptive `Error`: `"useTheme() must be used within a <ThemeProvider>..."`
  - Return `context.tokens`.

## 3. Create useColorTier Hook
**File:** `apps/tui/src/hooks/useColorTier.ts`
- Import `useContext` from `react`.
- Import `ThemeContext` from `../providers/ThemeProvider.js`.
- Import `ColorTier` from `../theme/detect.js`.
- Export `useColorTier` function:
  - Call `useContext(ThemeContext)`.
  - If context is `null`, throw a descriptive `Error`: `"useColorTier() must be used within a <ThemeProvider>..."`
  - Return `context.colorTier`.

## 4. Update Barrel Exports
**File:** `apps/tui/src/hooks/index.ts`
- Append the following exports:
  ```typescript
  export { useTheme } from "./useTheme.js";
  export { useColorTier } from "./useColorTier.js";
  ```

**File:** `apps/tui/src/providers/index.ts`
- Append the following exports:
  ```typescript
  export { ThemeProvider, ThemeContext } from "./ThemeProvider.js";
  export type { ThemeContextValue, ThemeProviderProps } from "./ThemeProvider.js";
  ```
- Remove or update the `Planned providers` comment to reflect that `ThemeProvider` is now implemented.

## 5. Implement E2E Tests
**File:** `e2e/tui/app-shell.test.ts`
- Append a new `describe("TUI_APP_SHELL — ThemeProvider and useTheme hook", () => { ... })` block at the end of the file.
- Implement all 24 required tests using `bunEval`, `run`, and `launchTUI` as specified in the engineering spec:
  - **File Existence & Export Tests** (PROVIDER-FILE-001 to 006)
  - **Behavior Tests** (PROVIDER-RENDER-001 to 003)
  - **useTheme Tests** (PROVIDER-HOOK-001 to 003)
  - **useColorTier Tests** (PROVIDER-TIER-001 to 003)
  - **Module Integration Tests** (PROVIDER-IMPORT-001 to 004)
  - **Compile Tests** (PROVIDER-TSC-001 to 003)
  - **Guard & Immutability Tests** (PROVIDER-GUARD-001 to 003)
  - **Integration Snapshot Tests** (PROVIDER-SNAP-001 to 003) — leave failing if the TUI entry point hasn't wired the provider yet.

## 6. Verification
- Run `bun run check` from `apps/tui/` to ensure TypeScript compilation passes.
- Run `bun test e2e/tui/app-shell.test.ts` to ensure all structural and module tests pass.