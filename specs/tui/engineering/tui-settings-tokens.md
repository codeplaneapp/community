## Implementation Plan

### Step 1: Scaffold Types and Constants
- Create `apps/tui/src/screens/settings/tokens/constants.ts` to export the valid API scopes for personal access tokens: `all`, `read:repository`, `write:repository`, `read:organization`, `write:organization`, `read:user`, `write:user`, `read:admin`, `write:admin`, `admin`.
- Define type definitions for the token object if not already provided by `@codeplane/ui-core`, otherwise import from `@codeplane/sdk`.

### Step 2: Build `CreateTokenForm` Component
- Create `apps/tui/src/screens/settings/tokens/CreateTokenForm.tsx`.
- Use local state for `name` (string) and `selectedScopes` (Set<string>).
- Render `<input>` for the token name and a `<box>` with `flexDirection="column"` for the scope checklist.
- Implement keyboard navigation:
  - `Tab`/`Shift+Tab` switches focus between the name input, the scope checklist, and the submit button.
  - `j`/`k` or arrows navigate up/down within the checklist.
  - `Space` toggles the focused scope (`[✓]` vs `[ ]`).
  - `Ctrl+S` or `Enter` on the submit button triggers `onSubmit`.
  - `Esc` triggers `onCancel`.
- Validate input: Disable submission if `name` is empty or `selectedScopes` is empty. Check `name` length (max 255) and display character count.
- Handle 403 Forbidden specifically when a non-admin requests admin scopes.

### Step 3: Build `TokenRevealPanel` Component
- Create `apps/tui/src/screens/settings/tokens/TokenRevealPanel.tsx`.
- Accept `tokenString`, `tokenName`, `scopes` as props.
- Render a `<box border="single" borderColor={theme.success}>` with warning text in `theme.warning`.
- Render the full `codeplane_...` token inside a `<code>` block.
- Trap focus and bind `Enter` and `Esc` to the `onDismiss` callback. Ensure the local token state is cleared on unmount.

### Step 4: Build `TokenListItem` Component
- Create `apps/tui/src/screens/settings/tokens/TokenListItem.tsx`.
- Accept `token`, `isFocused`, and layout breakpoint as props.
- Responsive layout logic:
  - At `< 120` columns (minimum): Single-line layout. Truncate name with `…`, display `••••{last_eight}` right-aligned.
  - At `>= 120` columns (standard+): Two-line layout. Line 1: name + identifier. Line 2: Scope badges (bracketed, `theme.primary`) + relative timestamp.
- Highlight the component with reverse video or `theme.primary` background when `isFocused` is true.

### Step 5: Build `TokensTab` Screen
- Create `apps/tui/src/screens/settings/tokens/TokensTab.tsx`.
- Hook usage:
  - `const { tokens, isLoading, error, refetch } = useTokens()`
  - `const { mutateAsync: createToken } = useCreateToken()`
  - `const { mutateAsync: deleteToken } = useDeleteToken()`
- Define the state machine: `viewState` (`'loading' | 'list' | 'creating' | 'revealing' | 'error'`).
- Handle `a` keybinding to transition from `'list'` to `'creating'`.
- Implement `ScrollableList` for the token list. Ensure list is sorted newest first.
- Handle token deletion:
  - When `d` or `Delete` is pressed on a focused token, show a confirmation prompt in the status bar area.
  - Press `y` to confirm deletion, using optimistic updates (remove locally immediately, re-add if API fails, flash "Token revoked" via `tui-sync-toast-flash-system`).
  - Press `n` or `Esc` to cancel the prompt.
- Incorporate `TokenRevealPanel`: When `createToken` resolves with 201, transition to `'revealing'` state and pass the unhashed token to the panel.
- On `R`, trigger `refetch()`.

### Step 6: Integrate with Settings Screen
- Update `apps/tui/src/screens/settings/SettingsScreen.tsx` (or equivalent tab router).
- Register the Tokens tab at index `4`.
- Ensure `Tab`/`Shift+Tab` cycles gracefully between the main settings tabs, while keeping `TokensTab` active.

## Unit & Integration Tests

All tests target `e2e/tui/settings.test.ts` using `@microsoft/tui-test`.

**1. Token List Display**
- `renders token list with name, identifier, scopes, and timestamp`: Verify 120x40 snapshot correctly displays multi-line format.
- `renders empty state when user has no tokens`: Mock empty API response, verify "No personal access tokens" prompt and `a` key hint.
- `displays loading spinner while fetching`: Assert "Loading tokens…" text when promise is pending.
- `token identifier shows bullet prefix and last eight chars`: Assert format matches `••••a1b2c3d4`.

**2. Token List Navigation**
- `j/k navigates between entries`: Press `j` and assert reverse video style moves to the second element.
- `G jumps to last, g g jumps to first`: Test bounding navigation limits.
- `Ctrl+D and Ctrl+U page through long lists`: Verify virtual scroll positioning.

**3. Create Token Flow**
- `a opens create form`: Navigate to tokens, press `a`, assert form labels and submit button are visible.
- `Tab navigates between fields`: Assert focus transitions correctly through Name -> Scopes -> Submit.
- `Space toggles scope selection`: Press Space on a scope item and assert `[ ]` transitions to `[✓]`.
- `Ctrl+S submits and shows reveal panel`: Mock `POST` to return a fake token, press `Ctrl+S`, assert `codeplane_` prefix string is rendered.
- `Enter dismisses reveal panel`: From reveal panel, press `Enter` and assert panel disappears, revealing list with new token on top.
- `create form disables submit when incomplete`: Assert "Create Token" button appears in muted color initially.
- `create form shows error for forbidden admin scopes (403)`: Verify error text is displayed below the scope picker when triggered.

**4. Revoke Token Flow**
- `d shows revoke confirmation`: Select a token, press `d`, verify prompt text includes "Revoke token" and "[y/N]".
- `y confirms and removes token`: Press `y`, mock 204 response, verify token disappears and "Token revoked" flash message is present.
- `n cancels revoke`: Press `n`, verify prompt disappears and token remains untouched.

**5. Responsive Layout**
- `single-line entries at 80x24`: Launch at 80x24 layout, snapshot, assert scopes and timestamps are hidden.
- `two-line entries at 120x40`: Assert visibility of all fields at standard width.
- `create form adjusts on resize`: Resize terminal dynamically during form display, assert form layout adapts without losing current text input.