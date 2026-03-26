## Implementation Plan

### Step 1: Scaffold Types and Constants
- **Target File:** `apps/tui/src/screens/settings/tokens/constants.ts`
- Export a constant array `TOKEN_SCOPES` containing the valid API scopes: `'all'`, `'read:repository'`, `'write:repository'`, `'read:organization'`, `'write:organization'`, `'read:user'`, `'write:user'`, `'read:admin'`, `'write:admin'`, `'admin'`.
- Define and export the `Token` interface (if not available in `@codeplane/sdk` or `@codeplane/ui-core`):
  ```typescript
  export interface Token {
    id: string;
    name: string;
    identifier: string;
    scopes: string[];
    createdAt: string;
    lastUsedAt?: string;
  }
  ```

### Step 2: Implement Data Layer Hooks
- **Target File:** `apps/tui/src/screens/settings/tokens/hooks.ts`
- Implement `useTokens()`, `useCreateToken()`, and `useDeleteToken()` using the `useAPIClient` hook provided by `apps/tui/src/providers/APIClientProvider.tsx`.
  - `useTokens`: Fetch from `GET /api/user/tokens`. Return `{ tokens, isLoading, error, refetch }`.
  - `useCreateToken`: Post to `POST /api/user/tokens` with `{ name, scopes }`. Return `{ mutateAsync }`.
  - `useDeleteToken`: Delete via `DELETE /api/user/tokens/:id`. Wrap with optimistic updates via `useOptimisticMutation` from `apps/tui/src/hooks/useOptimisticMutation.ts` (entityType: `"token"`, action: `"revoke"`).

### Step 3: Build `CreateTokenForm` Component
- **Target File:** `apps/tui/src/screens/settings/tokens/CreateTokenForm.tsx`
- Use local state for `name` (string) and `selectedScopes` (Set<string>).
- Render an `<input>` for the token name and a `<box flexDirection="column">` for the scope checklist using OpenTUI components.
- Implement keyboard navigation:
  - `Tab`/`Shift+Tab` switches focus between the name input, the scope checklist, and the submit button.
  - `j`/`k` or arrows navigate up/down within the checklist.
  - `Space` toggles the focused scope (`[✓]` vs `[ ]`).
  - `Ctrl+S` or `Enter` on the submit button triggers `onSubmit(name, Array.from(selectedScopes))`.
  - `Esc` triggers `onCancel()`.
- Validation: Disable submission if `name` is empty or `selectedScopes` is empty. Enforce `name` length (max 255) and display character count.
- Error Handling: Handle 403 Forbidden specifically when a non-admin requests admin scopes and display an inline error below the scope picker.

### Step 4: Build `TokenRevealPanel` Component
- **Target File:** `apps/tui/src/screens/settings/tokens/TokenRevealPanel.tsx`
- Accept props: `tokenString`, `tokenName`, `scopes`, `onDismiss`.
- Import `useTheme` from `apps/tui/src/hooks/useTheme.ts`.
- Render a `<box border="single" borderColor={theme.success}>` with warning text in `theme.warning` stating to copy the token now as it won't be shown again.
- Render the full `codeplane_...` token string inside an OpenTUI `<code>` block.
- Trap focus and bind `Enter` and `Esc` to the `onDismiss` callback. Ensure the local token state is cleared on unmount.

### Step 5: Build `TokenListItem` Component
- **Target File:** `apps/tui/src/screens/settings/tokens/TokenListItem.tsx`
- Accept props: `token`, `isFocused`, and layout breakpoint.
- Import `useTheme` for semantic colors.
- Highlight the component with reverse video or `theme.primary` background when `isFocused` is true.
- Responsive layout logic:
  - At `< 120` columns (minimum): Single-line layout. Truncate name with `…`, display `••••{last_eight}` right-aligned in `theme.muted`.
  - At `>= 120` columns (standard+): Two-line layout. 
    - Line 1: name + identifier.
    - Line 2: Scope badges (bracketed, `theme.primary`) + relative timestamp.

### Step 6: Build `TokensTab` Screen
- **Target File:** `apps/tui/src/screens/settings/tokens/TokensTab.tsx`
- Utilize the hooks defined in Step 2.
- Define the state machine: `viewState` (`'loading' | 'list' | 'creating' | 'revealing' | 'error'`).
- Main List View:
  - Handle `a` keybinding to transition from `'list'` to `'creating'`.
  - Implement `ScrollableList` for the token list, sorted newest first.
  - On `R`, trigger `refetch()`.
- Revoke Token Flow:
  - When `d` or `Delete` is pressed on a focused `TokenListItem`, show a confirmation prompt in the status bar area ("Revoke token [y/N]").
  - Press `y` to confirm deletion. This triggers `useDeleteToken`, flashing "Token revoked" via `tui-sync-toast-flash-system` upon successful optimistic completion.
  - Press `n` or `Esc` to cancel the prompt.
- Reveal Flow:
  - When `createToken` resolves with 201, transition to `'revealing'` state and pass the unhashed token to `TokenRevealPanel`.

### Step 7: Integrate with Settings Screen
- **Target File:** `apps/tui/src/screens/settings/SettingsScreen.tsx`
- Create the main settings tab router. Register the `TokensTab` as one of the tabs (e.g., at index 4).
- Ensure `Tab`/`Shift+Tab` cycles gracefully between the main settings tabs, while keeping `TokensTab` active.
- **Target File:** `apps/tui/src/router/registry.ts`
- Update `ScreenName.Settings` to map to `SettingsScreen` instead of `PlaceholderScreen`.

### Step 8: End-to-End Tests
- **Target File:** `e2e/tui/settings.test.ts`
- Use `@microsoft/tui-test` and import `TERMINAL_SIZES` from `e2e/tui/helpers.js`.
- **1. Token List Display:**
  - `renders token list with name, identifier, scopes, and timestamp`: Verify 120x40 snapshot correctly displays multi-line format.
  - `renders empty state when user has no tokens`: Mock empty API response, verify "No personal access tokens" prompt and `a` key hint.
  - `displays loading spinner while fetching`: Assert "Loading tokens…" text when promise is pending.
  - `token identifier shows bullet prefix and last eight chars`: Assert format matches `••••a1b2c3d4`.
- **2. Token List Navigation:**
  - `j/k navigates between entries`: Press `j` and assert reverse video style moves to the second element.
  - `G jumps to last, g g jumps to first`: Test bounding navigation limits.
  - `Ctrl+D and Ctrl+U page through long lists`: Verify virtual scroll positioning.
- **3. Create Token Flow:**
  - `a opens create form`: Navigate to tokens, press `a`, assert form labels and submit button are visible.
  - `Tab navigates between fields`: Assert focus transitions correctly through Name -> Scopes -> Submit.
  - `Space toggles scope selection`: Press Space on a scope item and assert `[ ]` transitions to `[✓]`.
  - `Ctrl+S submits and shows reveal panel`: Mock `POST` to return a fake token, press `Ctrl+S`, assert `codeplane_` prefix string is rendered.
  - `Enter dismisses reveal panel`: From reveal panel, press `Enter` and assert panel disappears, revealing list with new token on top.
  - `create form disables submit when incomplete`: Assert "Create Token" button appears in muted color initially.
  - `create form shows error for forbidden admin scopes (403)`: Verify error text is displayed below the scope picker when triggered.
- **4. Revoke Token Flow:**
  - `d shows revoke confirmation`: Select a token, press `d`, verify prompt text includes "Revoke token" and "[y/N]".
  - `y confirms and removes token`: Press `y`, mock 204 response, verify token disappears and "Token revoked" flash message is present.
  - `n cancels revoke`: Press `n`, verify prompt disappears and token remains untouched.
- **5. Responsive Layout:**
  - `single-line entries at 80x24`: Launch at 80x24 layout (`TERMINAL_SIZES.minimum`), snapshot, assert scopes and timestamps are hidden.
  - `two-line entries at 120x40`: Assert visibility of all fields at standard width (`TERMINAL_SIZES.standard`).
  - `create form adjusts on resize`: Resize terminal dynamically during form display, assert form layout adapts without losing current text input.