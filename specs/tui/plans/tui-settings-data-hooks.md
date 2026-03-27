# Implementation Plan: TUI Adapters for User Settings Data Hooks

This document outlines the step-by-step implementation plan for the `tui-settings-data-hooks` ticket, building the data hook layer for the Codeplane TUI settings screens.

## Step 1: Define Settings Domain Types

**File:** `apps/tui/src/hooks/settings-types.ts`
**Action:** Create file

1. Import the `HookError` type from `@codeplane/ui-core/src/types/errors.js` and re-export it.
2. Define all API response and request domain models (mirroring server-side types):
   - `UserProfile`, `UpdateUserRequest`
   - `EmailResponse`, `AddEmailRequest`
   - `SSHKeyResponse`, `AddSSHKeyRequest`
   - `TokenSummary`, `CreateTokenRequest`, `CreateTokenResult`
   - `NotificationPreferences`, `UpdateNotificationPreferencesRequest`
   - `ConnectedAccountResponse`
3. Define and export the standard hook return interfaces to ensure consistency across the application:
   - `QueryResult<T>`
   - `ListQueryResult<T>`
   - `MutationResult<TInput, TOutput>`

## Step 2: Implement Settings Data Hooks

**File:** `apps/tui/src/hooks/useSettingsData.ts`
**Action:** Create file

1. Import dependencies, including `useQuery` (local), `useMutation` (ui-core), `useAPIClient` (ui-core), `parseResponseError` (ui-core), and all types from `./settings-types.js`.
2. Instantiate module-scoped `Map<string, () => void>` instances for managing optimistic rollbacks (e.g., `updateUserRollbacks`, `addEmailRollbacks`, `deleteEmailRollbacks`, `addSSHKeyRollbacks`, `deleteSSHKeyRollbacks`, `deleteTokenRollbacks`, `updateNotifPrefsRollbacks`, `disconnectAccountRollbacks`).
3. Implement the read-only query hooks using the `useQuery` pattern:
   - `useUser()`: GET `/api/user`
   - `useUserEmails()`: GET `/api/user/emails`
   - `useUserSSHKeys()`: GET `/api/user/keys`
   - `useUserTokens()`: GET `/api/user/tokens`
   - `useNotificationPreferences()`: GET `/api/user/settings/notifications`
   - `useUserConnectedAccounts()`: GET `/api/user/connections`
4. Implement the mutation hooks using `useMutation`, wiring up the `onOptimistic`, `onSuccess`, and `onError` callbacks to interact with the module-scoped rollback Maps:
   - `useUpdateUser(callbacks)`: PATCH `/api/user`
   - `useAddEmail(callbacks)`: POST `/api/user/emails`
   - `useDeleteEmail(callbacks)`: DELETE `/api/user/emails/:id`
   - `useSendVerification(callbacks)`: POST `/api/user/emails/:id/verify` (No optimistic update map needed)
   - `useAddSSHKey(callbacks)`: POST `/api/user/keys`
   - `useDeleteSSHKey(callbacks)`: DELETE `/api/user/keys/:id`
   - `useCreateToken(callbacks)`: POST `/api/user/tokens` (No optimistic update map needed)
   - `useDeleteToken(callbacks)`: DELETE `/api/user/tokens/:id`
   - `useUpdateNotificationPreferences(callbacks)`: PUT `/api/user/settings/notifications`
   - `useDisconnectAccount(callbacks)`: DELETE `/api/user/connections/:id`
5. Ensure all mutations that encounter `!response.ok` throw a parsed response error using `parseResponseError(response)`.

## Step 3: Export Hooks and Types

**File:** `apps/tui/src/hooks/index.ts`
**Action:** Modify file

1. Add a new export block for the settings data hooks, exporting all 16 hooks from `./useSettingsData.js`.
2. Add a new export block for the settings types, exporting the 12 domain interfaces from `./settings-types.js`.

## Step 4: Create End-to-End Tests

**File:** `e2e/tui/settings.test.ts`
**Action:** Create file

1. Import `@microsoft/tui-test` utilities (`createTestTui` / `launchTUI`).
2. Group tests logically using `describe` blocks mapped to the feature flags specified in the PRD:
   - `TUI_SETTINGS_PROFILE`
   - `TUI_SETTINGS_EMAILS`
   - `TUI_SETTINGS_SSH_KEYS`
   - `TUI_SETTINGS_TOKENS`
   - `TUI_SETTINGS_NOTIFICATION_PREFS`
   - `TUI_SETTINGS_CONNECTED_ACCOUNTS`
   - Error states
   - Loading states
   - Responsive layout
3. Implement the snapshot and key interaction tests as defined in the engineering specification. Ensure navigation to the settings view occurs correctly (e.g., using the command palette `g s` or appropriate mapping).
4. Validate that tests run against the true API server and rely on snapshot matching (`toMatchSnapshot()`) to verify UI changes triggered by the hooks.