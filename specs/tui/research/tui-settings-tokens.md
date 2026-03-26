# Research: `tui-settings-tokens` Context

Based on your implementation plan and the current state of the repository, here is all the relevant codebase context, patterns, and paths you need to implement the TUI Settings Tokens tab.

## 1. Directory Structure & Missing Scaffold
Currently, the Settings screen does not exist. The router directs the `Settings` route to a `PlaceholderScreen`. You will need to create the new directory structure from scratch:
- **Path:** `apps/tui/src/screens/settings/`
- **Target Files:**
  - `apps/tui/src/screens/settings/SettingsScreen.tsx` (the main tab router for settings)
  - `apps/tui/src/screens/settings/tokens/constants.ts`
  - `apps/tui/src/screens/settings/tokens/CreateTokenForm.tsx`
  - `apps/tui/src/screens/settings/tokens/TokenRevealPanel.tsx`
  - `apps/tui/src/screens/settings/tokens/TokenListItem.tsx`
  - `apps/tui/src/screens/settings/tokens/TokensTab.tsx`

## 2. Router Integration (`apps/tui/src/router/registry.ts`)
The `Settings` and `OrgSettings` routes are defined in `apps/tui/src/router/types.ts` and `apps/tui/src/router/registry.ts`. 
In `registry.ts`, `ScreenName.Settings` is currently mapped to `PlaceholderScreen`:
```typescript
  [ScreenName.Settings]: {
    component: PlaceholderScreen,
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Settings",
  },
```
You will need to replace `PlaceholderScreen` with your newly created `SettingsScreen`.

## 3. Data Layer & Hooks (`@codeplane/ui-core` stub)
The spec instructs you to use `useTokens`, `useCreateToken`, and `useDeleteToken` from `@codeplane/ui-core`. However, `@codeplane/ui-core` is currently absent/mocked. 

Instead, use the mocked `APIClient` provided via context in `apps/tui/src/providers/APIClientProvider.tsx`:
```typescript
import { useAPIClient } from "../../../../providers/APIClientProvider.js";

// Example usage within your hooks:
const client = useAPIClient();
// Use fetch(`${client.baseUrl}/api/user/tokens`, { headers: { Authorization: `Bearer ${client.token}` } })
```
You should implement `useTokens`, `useCreateToken`, and `useDeleteToken` as local hooks (e.g., inside `apps/tui/src/screens/settings/tokens/hooks.ts` or `apps/tui/src/hooks/`).

## 4. Shared Mutations (`apps/tui/src/hooks/useOptimisticMutation.ts`)
For revoking tokens, the spec requires optimistic updates. The TUI provides `useOptimisticMutation` for exactly this purpose:
```typescript
import { useOptimisticMutation } from "../../../../hooks/useOptimisticMutation.js";

const { execute, isLoading } = useOptimisticMutation({
  id: `delete-token-${tokenId}`,
  entityType: "token",
  action: "revoke",
  mutate: async () => { /* API call */ },
  onOptimistic: () => { /* remove locally */ },
  onRevert: () => { /* restore locally */ }
});
```

## 5. Theming & Styling (`apps/tui/src/theme/tokens.ts`)
The spec references several theme colors (`theme.success`, `theme.warning`, `theme.primary`, etc.). These semantic RGBA tokens are defined in `apps/tui/src/theme/tokens.ts`. Access them via the `useTheme()` hook in `@opentui/react` or the local wrapper:
```typescript
import { useTheme } from "../../../../hooks/useTheme.js";
// Alternatively from context depending on the app's setup.

// Available tokens:
// theme.primary   (Focused items, highlights)
// theme.success   (Green: Added tokens, success borders)
// theme.warning   (Yellow: Warning text)
// theme.error     (Red: Errors)
// theme.muted     (Dim: Identifiers like ••••a1b2c3d4)
// theme.surface   (Backgrounds)
// theme.border    (Borders)
```

## 6. End-to-End Testing (`e2e/tui/settings.test.ts`)
The implementation plan states that tests belong in `e2e/tui/settings.test.ts` using `@microsoft/tui-test`. This file needs to be created.

Refer to `e2e/tui/helpers.ts` for standard dimensions and test launch utilities:
```typescript
import { TERMINAL_SIZES } from "./helpers.js";

// TERMINAL_SIZES.minimum (80x24)
// TERMINAL_SIZES.standard (120x40)
// TERMINAL_SIZES.large (200x60)
```
You will need to assert key sequences (e.g., `a`, `j`/`k`, `Tab`, `Space`, `Ctrl+S`, `Enter`, `d`, `y`, `n`) and snapshot outputs based on responsive breakpoints.