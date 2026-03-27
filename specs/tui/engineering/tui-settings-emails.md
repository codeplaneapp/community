# Engineering Specification: TUI_SETTINGS_EMAILS

## Overview
This specification details the architecture and implementation steps for the Settings Emails tab (`TUI_SETTINGS_EMAILS`) within the Codeplane TUI. It provides a keyboard-driven interface to manage user email addresses, supporting responsive layouts, optimistic updates, and robust error handling.

---

## Implementation Plan

### 1. Component Structure & Routing
**Target File:** `apps/tui/src/screens/settings/EmailsTab.tsx`
**Integration File:** `apps/tui/src/screens/SettingsScreen.tsx`

1. **Update `SettingsScreen.tsx`:** 
   - Add `"Emails"` to the list of available tabs.
   - Bind `Tab` and `2` to activate the Emails tab index.
   - Render `<EmailsTab />` when the active tab index is `1` (second tab).

2. **Create `<EmailsTab />` Component:**
   - Scaffold the layout using OpenTUI's `<box>` with `flexDirection="column"`.
   - Implement the two primary sections: the **Add Email Form** (top) and the **Email List** (`<scrollbox>`, bottom).

### 2. State Management & Data Hooks
Utilize shared hooks from `@codeplane/ui-core` and local React state to drive the UI.

**Local State:**
```typescript
const [focusedIndex, setFocusedIndex] = useState(0);
const [isInputFocused, setIsInputFocused] = useState(false);
const [emailInput, setEmailInput] = useState("");
const [isPrimaryChecked, setIsPrimaryChecked] = useState(false);
const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
const [verifyCooldowns, setVerifyCooldowns] = useState<Record<number, number>>({}); // id -> timestamp
const [validationError, setValidationError] = useState<string | null>(null);
```

**Data Hooks:**
```typescript
const { data: emails, isLoading, error, refetch } = useUserEmails();
const { mutate: addEmail, isPending: isAdding } = useAddEmail();
const { mutate: deleteEmail } = useDeleteEmail();
const { mutate: sendVerification } = useSendVerification();
const { mutate: setPrimary } = useSetPrimaryEmail();
```

### 3. Sub-components

#### A. Add Email Form
- Use `<box flexDirection="row">` at standard/large sizes, wrapping to column at minimum size.
- **Input:** `<input value={emailInput} onChange={handleInput} />`. Truncate display visually but allow scrolling up to 254 chars.
- **Validation:** On submit, check `emailInput.length >= 3`, `emailInput.includes('@')`, and `emailInput.trim() !== ""`. Set `validationError` if invalid, rendering text in `theme.error` (ANSI 196) below the input.
- **Limits:** If `emails.length >= 10`, disable input and show: *"Maximum of 10 email addresses reached."* in `theme.muted`.
- **Toggle:** Render primary toggle as `[ ]` / `[x] Set as primary`. Toggleable via `Space` when focused.

#### B. Scrollable Email List
- Use OpenTUI's `<scrollbox>`.
- Map over `emails` (sorted primary first, then `created_at` ascending).
- **Row Layout:** 
  - Focused row gets reverse video or a `▸` prefix styled with `theme.primary`.
  - Content: `Email Address` | `[Primary]` | `[Verified]/[Unverified]` | `Date`.
  - Use `useLayout()` to determine truncations:
    - *Minimum (80x24):* 40ch email, hide date.
    - *Standard (120x40):* 60ch email, show date.
    - *Large (200x60+):* 100ch email, show date.
- **Delete Confirmation:** If `deleteConfirmId === email.id`, render inline prompt below the row: `Remove {email.address}? [y/N]`.

### 4. Keyboard Navigation & Action Handlers
Register bindings using the TUI's `useScreenKeybindings` hook when the tab mounts. Ensure priority hierarchy (inputs capture keys first).

**List Navigation (when input not focused):**
- `j` / `Down`: `setFocusedIndex(i => Math.min(i + 1, emails.length - 1))`
- `k` / `Up`: `setFocusedIndex(i => Math.max(i - 1, 0))`
- `g g` / `G`: Jump to `0` / `emails.length - 1`.

**Actions:**
- `a`: `setIsInputFocused(true)` (moves focus to the `<input>`).
- `d`: If not primary, `setDeleteConfirmId(focusedEmail.id)`.
- `y`: If `deleteConfirmId` matches, execute optimistic `deleteEmail(id)`. Revert on error.
- `n` / `Esc`: Clear `deleteConfirmId`.
- `p`: If verified and non-primary, execute `setPrimary(id)`.
- `v`: If unverified, check `verifyCooldowns`. If expired/absent, `sendVerification(id)`. Set cooldown `Date.now() + 15000`. Show "Verification sent" status.

### 5. Status Bar & Telemetry Integration
- Wire up the StatusBar hints to dynamically show `[d] Delete`, `[p] Primary`, `[v] Verify`, `[a] Add` based on the currently focused row's capabilities.
- Dispatch telemetry events (e.g., `tui.settings.emails.add.submitted`) directly within the mutation success/error callbacks.

---

## Unit & Integration Tests

All tests target `e2e/tui/settings.test.ts` utilizing the `@microsoft/tui-test` framework.

### 1. Snapshot Tests
*Validate UI rendering against golden files across layout breakpoints.*
- `TUI_SETTINGS_EMAILS — emails tab renders with email list at 120x40`
- `TUI_SETTINGS_EMAILS — emails tab renders at 80x24 minimum size` (Date hidden, strict truncation)
- `TUI_SETTINGS_EMAILS — emails tab renders at 200x60 large size`
- `TUI_SETTINGS_EMAILS — empty email list renders empty state`
- `TUI_SETTINGS_EMAILS — client-side validation error renders below input`
- `TUI_SETTINGS_EMAILS — max emails message renders when at limit`

### 2. Keyboard Interaction Tests
*Verify vim-style navigation, form handling, and contextual row actions.*
- `TUI_SETTINGS_EMAILS — j/k moves focus up and down the email row list`
- `TUI_SETTINGS_EMAILS — a focuses add-email input and Esc returns focus to list`
- `TUI_SETTINGS_EMAILS — Enter and Ctrl+S submit the add-email form`
- `TUI_SETTINGS_EMAILS — d then y deletes non-primary email with inline confirmation`
- `TUI_SETTINGS_EMAILS — d on primary email is inert and shows warning in status bar`
- `TUI_SETTINGS_EMAILS — v on unverified email sends verification and enters 15s cooldown`
- `TUI_SETTINGS_EMAILS — Space toggles the primary checkbox in the add form`

### 3. Responsive & Layout Tests
*Simulate resize events using `useOnResize` handlers.*
- `TUI_SETTINGS_EMAILS — resize 120x40 to 80x24 dynamically hides date column`
- `TUI_SETTINGS_EMAILS — email string truncation adapts strictly to terminal width thresholds`

### 4. Error Handling Tests
*Validate network and API failure recoveries.*
- `TUI_SETTINGS_EMAILS — 409 on add shows duplicate conflict inline error`
- `TUI_SETTINGS_EMAILS — 500 on add preserves input value for retry`
- `TUI_SETTINGS_EMAILS — 500 on delete reverts optimistic removal from list`
- `TUI_SETTINGS_EMAILS — 429 on delete shows rate limit cooldown and reverts`

### 5. Edge Case & Integration Tests
*End-to-end data lifecycle.*
- `TUI_SETTINGS_EMAILS — single email user cannot delete their only email`
- `TUI_SETTINGS_EMAILS — input exceeding 254 chars or missing @ is blocked by client validation`
- `TUI_SETTINGS_EMAILS — e2e full lifecycle: add new email, set as primary, delete previous primary`
