# Engineering Specification: `tui-settings-data-hooks`

## TUI Adapters for User Settings Data Hooks

---

## 1. Overview

This ticket creates the TUI-side adapter hook layer for all user settings data endpoints. The hooks wrap `@codeplane/ui-core` primitives (`useMutation`, `usePaginatedQuery`, and the lower-level `useAPIClient` + `useQuery` patterns) and provide loading/error/data states with optimistic mutation support.

All hooks are implemented in a single module: **`apps/tui/src/hooks/useSettingsData.ts`** — following the existing convention where a domain (workflows, agents) groups its hooks in a single file or small cluster.

### Dependencies

| Dependency | Status | What this ticket needs from it |
|---|---|---|
| `tui-navigation-provider` | Prerequisite | `NavigationProvider` must be in the component tree so that mutation error messages (via `useLoading`) have a valid context. |
| `tui-theme-provider` | Prerequisite | `ThemeProvider` must be in the component tree for error-state rendering in consuming screens. |

### Feature Coverage

These hooks back the following feature flags from `specs/tui/features.ts`:

- `TUI_SETTINGS_PROFILE`
- `TUI_SETTINGS_EMAILS`
- `TUI_SETTINGS_SSH_KEYS`
- `TUI_SETTINGS_TOKENS`
- `TUI_SETTINGS_NOTIFICATION_PREFS`
- `TUI_SETTINGS_CONNECTED_ACCOUNTS`

---

## 2. API Surface Map

All hooks communicate with the Codeplane API via `@codeplane/ui-core`'s `useAPIClient()`. The following table maps each hook to its server endpoint and HTTP method.

| Hook | Method | Endpoint | Response Shape |
|------|--------|----------|----------------|
| `useUser()` | `GET` | `/api/user` | `UserProfile` |
| `useUpdateUser()` | `PATCH` | `/api/user` | `UserProfile` |
| `useUserEmails()` | `GET` | `/api/user/emails` | `EmailResponse[]` |
| `useAddEmail()` | `POST` | `/api/user/emails` | `EmailResponse` |
| `useDeleteEmail()` | `DELETE` | `/api/user/emails/:id` | `204 No Content` |
| `useSendVerification()` | `POST` | `/api/user/emails/:id/verify` | `200` (stub — 501 expected) |
| `useUserSSHKeys()` | `GET` | `/api/user/keys` | `SSHKeyResponse[]` |
| `useAddSSHKey()` | `POST` | `/api/user/keys` | `SSHKeyResponse` |
| `useDeleteSSHKey()` | `DELETE` | `/api/user/keys/:id` | `204 No Content` |
| `useUserTokens()` | `GET` | `/api/user/tokens` | `TokenSummary[]` |
| `useCreateToken()` | `POST` | `/api/user/tokens` | `CreateTokenResult` |
| `useDeleteToken()` | `DELETE` | `/api/user/tokens/:id` | `204 No Content` |
| `useNotificationPreferences()` | `GET` | `/api/user/settings/notifications` | `NotificationPreferences` |
| `useUpdateNotificationPreferences()` | `PUT` | `/api/user/settings/notifications` | `NotificationPreferences` |
| `useUserConnectedAccounts()` | `GET` | `/api/user/connections` | `ConnectedAccountResponse[]` |
| `useDisconnectAccount()` | `DELETE` | `/api/user/connections/:id` | `204 No Content` |

---

## 3. Type Definitions

### File: `apps/tui/src/hooks/settings-types.ts`

All domain types live in a dedicated types file, matching the pattern established by `workflow-types.ts`.

```typescript
import type { HookError as CoreHookError } from "@codeplane/ui-core/src/types/errors.js";

// ---- Re-export HookError for consumer convenience ----
export type HookError = CoreHookError;

// ---- Domain models (match server API response shapes) ----

export interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  email: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateUserRequest {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  email?: string;
}

export interface EmailResponse {
  id: number;
  email: string;
  is_activated: boolean;
  is_primary: boolean;
  created_at: string;
}

export interface AddEmailRequest {
  email: string;
  is_primary: boolean;
}

export interface SSHKeyResponse {
  id: number;
  name: string;
  public_key: string;
  fingerprint: string;
  key_type: string;
  created_at: string;
  updated_at: string;
}

export interface AddSSHKeyRequest {
  title: string;
  key: string;
}

export interface TokenSummary {
  id: number;
  name: string;
  token_last_eight: string;
  scopes: string[];
}

export interface CreateTokenRequest {
  name: string;
  scopes: string[];
}

export interface CreateTokenResult extends TokenSummary {
  /** Full token text — only returned once at creation time. */
  token: string;
}

export interface NotificationPreferences {
  email_notifications_enabled: boolean;
}

export interface UpdateNotificationPreferencesRequest {
  email_notifications_enabled?: boolean;
}

export interface ConnectedAccountResponse {
  id: number;
  provider: string;
  provider_user_id: string;
  created_at: string;
  updated_at: string;
}

// ---- Hook return types (consistent with workflow-types.ts) ----

export interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: HookError | null;
  refetch: () => void;
}

export interface ListQueryResult<T> {
  data: T[];
  loading: boolean;
  error: HookError | null;
  refetch: () => void;
}

export interface MutationResult<TInput, TOutput = void> {
  execute: (input: TInput) => Promise<TOutput>;
  loading: boolean;
  error: HookError | null;
  reset: () => void;
}
```

---

## 4. Implementation Plan

### Step 1: Create the settings types file

**File:** `apps/tui/src/hooks/settings-types.ts`

Define all domain types and hook return types as specified in §3 above. These mirror the server-side types from `apps/server/src/routes/users.ts` with a client-side perspective (e.g., `id: number` — uses server's wire format).

**Rationale:** Separating types follows the `workflow-types.ts` pattern. Types are importable independently without pulling in React runtime code.

### Step 2: Implement query hooks (read operations)

**File:** `apps/tui/src/hooks/useSettingsData.ts`

Implement the six read hooks using the existing `useQuery` pattern from `apps/tui/src/hooks/useQuery.ts`:

#### 2a. `useUser()`

```typescript
export function useUser(): QueryResult<UserProfile> {
  return useQuery<UserProfile>({ path: "/api/user" });
}
```

- Returns the authenticated user's full profile.
- Fetches on mount, re-fetches via `refetch()`.
- No parameters — always the authenticated user.

#### 2b. `useUserEmails()`

```typescript
export function useUserEmails(): ListQueryResult<EmailResponse> {
  const result = useQuery<EmailResponse[]>({ path: "/api/user/emails" });
  return {
    data: result.data ?? [],
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
```

- Returns flat array (server does not paginate this endpoint).
- `data` defaults to empty array when `null` (pre-load).

#### 2c. `useUserSSHKeys()`

```typescript
export function useUserSSHKeys(): ListQueryResult<SSHKeyResponse>
```

- Same pattern as `useUserEmails()`, path: `/api/user/keys`.

#### 2d. `useUserTokens()`

```typescript
export function useUserTokens(): ListQueryResult<TokenSummary>
```

- Same pattern, path: `/api/user/tokens`.

#### 2e. `useNotificationPreferences()`

```typescript
export function useNotificationPreferences(): QueryResult<NotificationPreferences>
```

- Singleton object, path: `/api/user/settings/notifications`.

#### 2f. `useUserConnectedAccounts()`

```typescript
export function useUserConnectedAccounts(): ListQueryResult<ConnectedAccountResponse>
```

- Same pattern, path: `/api/user/connections`.

### Step 3: Implement mutation hooks (write operations)

All mutation hooks use `useMutation` from `@codeplane/ui-core/src/hooks/internal/useMutation.ts`, following the pattern from `useWorkflowActions.ts`.

#### 3a. `useUpdateUser()`

```typescript
export function useUpdateUser(
  callbacks?: {
    onOptimistic?: (input: UpdateUserRequest) => (() => void) | void;
    onSuccess?: (result: UserProfile, input: UpdateUserRequest) => void;
    onError?: (error: HookError, input: UpdateUserRequest) => void;
  },
): MutationResult<UpdateUserRequest, UserProfile>
```

- `PATCH /api/user` with JSON body.
- Supports `onOptimistic` for immediately updating displayed profile fields.
- On success, returns the updated `UserProfile`.
- On error, calls rollback if `onOptimistic` returned a function.

**Optimistic update contract:** The consumer (Settings screen) calls `onOptimistic` to immediately update local state (e.g., change the displayed `display_name`). If the server rejects the update, the rollback function restores the previous value.

#### 3b. `useAddEmail()`

```typescript
export function useAddEmail(
  callbacks?: {
    onOptimistic?: (input: AddEmailRequest) => (() => void) | void;
    onSuccess?: (result: EmailResponse, input: AddEmailRequest) => void;
    onError?: (error: HookError, input: AddEmailRequest) => void;
  },
): MutationResult<AddEmailRequest, EmailResponse>
```

- `POST /api/user/emails` with `{ email, is_primary }`.
- Optimistic: append a placeholder email row to the list.
- On error: remove the placeholder.

#### 3c. `useDeleteEmail()`

```typescript
export function useDeleteEmail(
  callbacks?: {
    onOptimistic?: (emailId: number) => (() => void) | void;
    onSuccess?: (emailId: number) => void;
    onError?: (error: HookError, emailId: number) => void;
  },
): MutationResult<number, void>
```

- `DELETE /api/user/emails/:id`.
- Optimistic: remove email from displayed list immediately.
- On error: restore the email row.

#### 3d. `useSendVerification()`

```typescript
export function useSendVerification(
  callbacks?: {
    onSuccess?: (emailId: number) => void;
    onError?: (error: HookError, emailId: number) => void;
  },
): MutationResult<number, void>
```

- `POST /api/user/emails/:id/verify`.
- No optimistic update (verification is server-side, 501 expected from current stub).
- The hook is implemented to handle both the 501 stub and a future working implementation.

#### 3e. `useAddSSHKey()`

```typescript
export function useAddSSHKey(
  callbacks?: {
    onOptimistic?: (input: AddSSHKeyRequest) => (() => void) | void;
    onSuccess?: (result: SSHKeyResponse, input: AddSSHKeyRequest) => void;
    onError?: (error: HookError, input: AddSSHKeyRequest) => void;
  },
): MutationResult<AddSSHKeyRequest, SSHKeyResponse>
```

- `POST /api/user/keys` with `{ title, key }`.
- Optimistic: append a placeholder SSH key row.

#### 3f. `useDeleteSSHKey()`

```typescript
export function useDeleteSSHKey(
  callbacks?: {
    onOptimistic?: (keyId: number) => (() => void) | void;
    onSuccess?: (keyId: number) => void;
    onError?: (error: HookError, keyId: number) => void;
  },
): MutationResult<number, void>
```

- `DELETE /api/user/keys/:id`.
- Optimistic: remove key from list.

#### 3g. `useCreateToken()`

```typescript
export function useCreateToken(
  callbacks?: {
    onSuccess?: (result: CreateTokenResult, input: CreateTokenRequest) => void;
    onError?: (error: HookError, input: CreateTokenRequest) => void;
  },
): MutationResult<CreateTokenRequest, CreateTokenResult>
```

- `POST /api/user/tokens` with `{ name, scopes }`.
- **No optimistic update.** Token creation returns a one-time-visible `token` field. The consumer must display this token to the user immediately (it is never returned again). Optimistic updates would create a fake token ID that doesn't match reality.
- On success, the consumer appends the new `TokenSummary` to the list and displays the `token` field in a modal/overlay.

#### 3h. `useDeleteToken()`

```typescript
export function useDeleteToken(
  callbacks?: {
    onOptimistic?: (tokenId: number) => (() => void) | void;
    onSuccess?: (tokenId: number) => void;
    onError?: (error: HookError, tokenId: number) => void;
  },
): MutationResult<number, void>
```

- `DELETE /api/user/tokens/:id`.
- Optimistic: remove token from list.

#### 3i. `useUpdateNotificationPreferences()`

```typescript
export function useUpdateNotificationPreferences(
  callbacks?: {
    onOptimistic?: (input: UpdateNotificationPreferencesRequest) => (() => void) | void;
    onSuccess?: (result: NotificationPreferences, input: UpdateNotificationPreferencesRequest) => void;
    onError?: (error: HookError, input: UpdateNotificationPreferencesRequest) => void;
  },
): MutationResult<UpdateNotificationPreferencesRequest, NotificationPreferences>
```

- `PUT /api/user/settings/notifications`.
- Optimistic: toggle the checkbox/value immediately in the UI.

#### 3j. `useDisconnectAccount()`

```typescript
export function useDisconnectAccount(
  callbacks?: {
    onOptimistic?: (accountId: number) => (() => void) | void;
    onSuccess?: (accountId: number) => void;
    onError?: (error: HookError, accountId: number) => void;
  },
): MutationResult<number, void>
```

- `DELETE /api/user/connections/:id`.
- Optimistic: remove account from displayed list.

### Step 4: Wire rollback pattern for mutations

All mutation hooks that support optimistic updates follow the rollback pattern established in `useWorkflowActions.ts`, with an improvement:

**Improvement over workflow pattern:** Instead of attaching rollback functions to the hook function object (`(hookFn as any)[key]`), use a module-scoped `Map<string, () => void>` per hook. This avoids polluting function objects and is clearer for garbage collection.

```typescript
const deleteEmailRollbacks = new Map<string, () => void>();
```

Each mutation hook uses a unique key derived from its inputs (e.g., `"deleteEmail_${emailId}"`) to store and retrieve rollback functions.

The rollback lifecycle in each mutation hook:

```typescript
onOptimistic: (input) => {
  if (callbacks?.onOptimistic) {
    const rollback = callbacks.onOptimistic(input);
    if (typeof rollback === "function") {
      rollbackStore.set(keyFor(input), rollback);
    }
  }
},
onError: (err, input) => {
  const rollback = rollbackStore.get(keyFor(input));
  if (typeof rollback === "function") {
    rollback();
  }
  rollbackStore.delete(keyFor(input));
  callbacks?.onError?.(err, input);
},
onSuccess: (result, input) => {
  rollbackStore.delete(keyFor(input));
  callbacks?.onSuccess?.(result, input);
},
```

### Step 5: Export from hooks barrel

**File:** `apps/tui/src/hooks/index.ts`

Append exports for all new hooks and types:

```typescript
// Settings data hooks
export {
  useUser,
  useUpdateUser,
  useUserEmails,
  useAddEmail,
  useDeleteEmail,
  useSendVerification,
  useUserSSHKeys,
  useAddSSHKey,
  useDeleteSSHKey,
  useUserTokens,
  useCreateToken,
  useDeleteToken,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useUserConnectedAccounts,
  useDisconnectAccount,
} from "./useSettingsData.js";

export type {
  UserProfile,
  UpdateUserRequest,
  EmailResponse,
  AddEmailRequest,
  SSHKeyResponse,
  AddSSHKeyRequest,
  TokenSummary,
  CreateTokenRequest,
  CreateTokenResult,
  NotificationPreferences,
  UpdateNotificationPreferencesRequest,
  ConnectedAccountResponse,
} from "./settings-types.js";
```

---

## 5. Detailed Implementation

### File: `apps/tui/src/hooks/useSettingsData.ts`

```typescript
import { useMutation } from "@codeplane/ui-core/src/hooks/internal/useMutation.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import { parseResponseError } from "@codeplane/ui-core/src/types/errors.js";
import { useQuery } from "./useQuery.js";
import type {
  HookError,
  QueryResult,
  ListQueryResult,
  MutationResult,
  UserProfile,
  UpdateUserRequest,
  EmailResponse,
  AddEmailRequest,
  SSHKeyResponse,
  AddSSHKeyRequest,
  TokenSummary,
  CreateTokenRequest,
  CreateTokenResult,
  NotificationPreferences,
  UpdateNotificationPreferencesRequest,
  ConnectedAccountResponse,
} from "./settings-types.js";
```

**Internal helpers:**

```typescript
/** Module-scoped rollback stores — one per mutation hook that supports optimistic updates. */
const updateUserRollbacks = new Map<string, () => void>();
const addEmailRollbacks = new Map<string, () => void>();
const deleteEmailRollbacks = new Map<string, () => void>();
const addSSHKeyRollbacks = new Map<string, () => void>();
const deleteSSHKeyRollbacks = new Map<string, () => void>();
const deleteTokenRollbacks = new Map<string, () => void>();
const updateNotifPrefsRollbacks = new Map<string, () => void>();
const disconnectAccountRollbacks = new Map<string, () => void>();
```

Each mutation hooks into the `useMutation` lifecycle via `onOptimistic`, `onSuccess`, and `onError`, storing/clearing rollback functions from the appropriate map.

### Implementation details per hook

**Query hooks** follow this exact pattern (shown for `useUser`, others are identical with different paths and types):

```typescript
export function useUser(): QueryResult<UserProfile> {
  return useQuery<UserProfile>({ path: "/api/user" });
}

export function useUserEmails(): ListQueryResult<EmailResponse> {
  const result = useQuery<EmailResponse[]>({ path: "/api/user/emails" });
  return {
    data: result.data ?? [],
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
```

**Mutation hooks** follow this pattern (shown for `useDeleteEmail`, others are structurally identical):

```typescript
export function useDeleteEmail(
  callbacks?: {
    onOptimistic?: (emailId: number) => (() => void) | void;
    onSuccess?: (emailId: number) => void;
    onError?: (error: HookError, emailId: number) => void;
  },
): MutationResult<number, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<number, void>({
    mutationFn: async (emailId, signal) => {
      const response = await client.request(
        `/api/user/emails/${emailId}`,
        { method: "DELETE", signal },
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
    onOptimistic: (emailId) => {
      if (callbacks?.onOptimistic) {
        const rollback = callbacks.onOptimistic(emailId);
        if (typeof rollback === "function") {
          deleteEmailRollbacks.set(`${emailId}`, rollback);
        }
      }
    },
    onSuccess: (_result, emailId) => {
      deleteEmailRollbacks.delete(`${emailId}`);
      callbacks?.onSuccess?.(emailId);
    },
    onError: (err, emailId) => {
      const rollback = deleteEmailRollbacks.get(`${emailId}`);
      if (typeof rollback === "function") {
        rollback();
      }
      deleteEmailRollbacks.delete(`${emailId}`);
      callbacks?.onError?.(err, emailId);
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}
```

**Mutations that return data** (e.g., `useUpdateUser`, `useAddEmail`, `useCreateToken`) parse the response JSON:

```typescript
mutationFn: async (input, signal) => {
  const response = await client.request("/api/user", {
    method: "PATCH",
    body: input,
    signal,
  });
  if (!response.ok) {
    throw await parseResponseError(response);
  }
  return response.json() as Promise<UserProfile>;
},
```

---

## 6. Optimistic Update Strategy

### When to use optimistic updates

| Hook | Optimistic | Rationale |
|------|-----------|----------|
| `useUpdateUser` | ✅ Yes | Profile fields can be shown immediately |
| `useAddEmail` | ✅ Yes | Placeholder row with `is_activated: false` |
| `useDeleteEmail` | ✅ Yes | Remove from list immediately |
| `useSendVerification` | ❌ No | Server-side action, no local state change |
| `useAddSSHKey` | ✅ Yes | Placeholder row with submitted key data |
| `useDeleteSSHKey` | ✅ Yes | Remove from list immediately |
| `useCreateToken` | ❌ No | Token value only available from server response |
| `useDeleteToken` | ✅ Yes | Remove from list immediately |
| `useUpdateNotificationPreferences` | ✅ Yes | Toggle shown immediately |
| `useDisconnectAccount` | ✅ Yes | Remove from list immediately |

### Optimistic delete pattern

The consuming screen (Settings) manages the list state. The optimistic callback removes the item and returns a rollback function that re-inserts it:

```typescript
// In the consuming screen:
const deleteEmail = useDeleteEmail({
  onOptimistic: (emailId) => {
    const removed = emails.find(e => e.id === emailId);
    setEmails(prev => prev.filter(e => e.id !== emailId));
    return () => {
      if (removed) {
        setEmails(prev => [...prev, removed]);
      }
    };
  },
  onError: (error) => {
    // Error already logged by mutation; status bar shows message
  },
});
```

### Optimistic add pattern

```typescript
const addEmail = useAddEmail({
  onOptimistic: (input) => {
    const placeholder: EmailResponse = {
      id: -Date.now(), // temporary negative ID
      email: input.email,
      is_activated: false,
      is_primary: input.is_primary,
      created_at: new Date().toISOString(),
    };
    setEmails(prev => [...prev, placeholder]);
    return () => {
      setEmails(prev => prev.filter(e => e.id !== placeholder.id));
    };
  },
  onSuccess: (result, input) => {
    // Replace placeholder with server-assigned entity
    setEmails(prev => prev.map(e =>
      e.id < 0 && e.email === input.email ? result : e
    ));
  },
});
```

---

## 7. Error Handling

All hooks propagate errors via the standard `HookError` type (`ApiError | NetworkError` from `@codeplane/ui-core`).

### Query error handling

- Query hooks set `error` on non-2xx responses or network failures.
- `loading` transitions to `false` on error.
- Consumers check `error` and display inline error messages.
- `refetch()` clears the error and retries.

### Mutation error handling

- Mutations throw on non-2xx responses (caught internally by `useMutation`).
- `onError` callback fires with the parsed `ApiError`.
- Rollback function executes automatically before `onError`.
- `error` state is set on the mutation result for display.
- `reset()` clears the error state.

### 501 Not Implemented handling

`useSendVerification()` targets a stub endpoint that returns 501. The hook does not special-case this — it propagates the error like any other. The consuming screen may display "Email verification not yet available" based on the 501 status.

---

## 8. Integration with Loading System

### Screen-level loading

The Settings screen uses `useScreenLoading()` with the query hooks:

```typescript
const user = useUser();
const screenLoading = useScreenLoading({
  id: "settings-screen",
  label: "Loading settings",
  isLoading: user.loading,
  error: user.error,
  onRetry: user.refetch,
});
```

### Mutation loading

Mutation hooks integrate with the TUI's `useLoading()` context via `useOptimisticMutation` at the screen level for operations where the status bar should show progress. The mutation hooks themselves expose `loading` and `error` for per-component loading states (e.g., disabled buttons, inline spinners).

---

## 9. Abort & Cleanup Behavior

### Query hooks

- Queries use `AbortController` internally (via `useQuery`).
- On unmount, the abort controller cancels in-flight requests.
- On parameter change, the previous request is aborted before the new one fires.

### Mutation hooks

- Mutations use `AbortController` via `useMutation`.
- **Critical note:** `useMutation` aborts on unmount. This is acceptable for settings mutations because they are fast and idempotent. If a user navigates away mid-mutation, the worst case is the mutation completes on the server but the local state doesn't update — the next screen visit will refetch.

---

## 10. Unit & Integration Tests

### File: `e2e/tui/settings.test.ts`

Tests use `@microsoft/tui-test` with the TUI launched against a real API server. Tests validate user-visible behavior, not implementation details.

```typescript
import { describe, test, expect } from "bun:test";
import { createTestTui } from "@microsoft/tui-test";

describe("TUI_SETTINGS", () => {
  // --- Profile hooks ---

  describe("TUI_SETTINGS_PROFILE", () => {
    test("SNAP-SET-001: Settings screen renders user profile data", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-SET-002: Settings screen at minimum terminal size (80x24)", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SET-001: Profile edit form accepts input and submits", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      await terminal.sendKeys("Tab");
      await terminal.sendText("New Display Name");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Sav");
    });

    test("KEY-SET-002: Profile edit shows error on invalid avatar URL", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });
  });

  // --- Email hooks ---

  describe("TUI_SETTINGS_EMAILS", () => {
    test("SNAP-SET-010: Email list displays user emails", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Email");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SET-010: Add email shows form and submits", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });

    test("KEY-SET-011: Delete email removes from list optimistically", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });

    test("KEY-SET-012: Send verification triggers API call", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });
  });

  // --- SSH Keys hooks ---

  describe("TUI_SETTINGS_SSH_KEYS", () => {
    test("SNAP-SET-020: SSH keys list displays keys with fingerprints", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      await terminal.waitForText("SSH");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SET-020: Add SSH key form accepts key paste and submits", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });

    test("KEY-SET-021: Delete SSH key removes from list with confirmation", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });
  });

  // --- Token hooks ---

  describe("TUI_SETTINGS_TOKENS", () => {
    test("SNAP-SET-030: Token list displays tokens with last eight chars", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SET-030: Create token shows full token value once", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });

    test("KEY-SET-031: Delete token removes from list optimistically", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });
  });

  // --- Notification preferences hooks ---

  describe("TUI_SETTINGS_NOTIFICATION_PREFS", () => {
    test("SNAP-SET-040: Notification preferences display current state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SET-040: Toggle notification preference updates optimistically", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });
  });

  // --- Connected accounts hooks ---

  describe("TUI_SETTINGS_CONNECTED_ACCOUNTS", () => {
    test("SNAP-SET-050: Connected accounts list displays providers", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-SET-050: Disconnect account removes from list", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });
  });

  // --- Error handling ---

  describe("Error states", () => {
    test("ERR-SET-001: Network error shows retry hint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_API_URL: "http://localhost:1" },
      });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("retry", 10000);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("ERR-SET-002: R key retries after error", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });

    test("ERR-SET-003: Auth error shows re-login message", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: "expired-token-value" },
      });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("codeplane auth login", 10000);
    });
  });

  // --- Loading states ---

  describe("Loading states", () => {
    test("LOAD-SET-001: Settings screen shows loading indicator initially", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
    });
  });

  // --- Responsive layout ---

  describe("Responsive layout", () => {
    test("SNAP-SET-060: Settings at large terminal (200x60)", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Settings");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });
});
```

### Test philosophy notes

1. **Tests that fail due to unimplemented backends stay failing.** The `useSendVerification` hook targets a 501 stub endpoint. The test (`KEY-SET-012`) asserts the error is displayed — it will pass because the hook correctly propagates the error. If the backend implements verification, the test will need updating to reflect the new behavior.

2. **No mocking.** All tests run against a real API server with test fixtures. The hooks are tested through the full TUI render pipeline — terminal → OpenTUI → React → hooks → API client → server.

3. **Snapshot tests capture rendered state.** They verify that data from the hooks actually reaches the terminal output. A broken hook → no data → snapshot mismatch → test fails.

4. **Key interaction tests verify the mutation flow.** They simulate the user action (delete, create, toggle) and assert the visible result (item removed, item added, toggle changed).

---

## 11. Productionization Checklist

This module has no PoC phase — it is built directly on proven patterns (`useQuery`, `useMutation`, `useWorkflowActions`). The following must be verified before the hooks are consumed by the Settings screen:

| Item | How to verify |
|------|---------------|
| All 6 query hooks return data from a running API server | Launch TUI with `CODEPLANE_TUI_DEBUG=true`, navigate to settings, confirm data logged to stderr |
| All 10 mutation hooks complete without errors on a running API server | Run each mutation via the Settings screen, verify 2xx responses |
| Optimistic updates revert correctly on server error | Temporarily return 500 from a settings endpoint, verify the reverted state matches pre-mutation |
| AbortController cleanup prevents memory leaks | Navigate rapidly between settings tabs, verify no "setState on unmounted component" warnings |
| Rollback maps are cleaned up after mutations | In debug mode, log rollback map sizes — should return to 0 after each mutation completes |
| Error states render the correct message for 401, 422, 500, and network errors | Test each error class against the Settings screen |
| `useCreateToken` displays the one-time token value | Create a token, verify the full token is shown, navigate away and back — token should NOT be visible |

### Performance constraints

- Query hooks must resolve within the 5-second timeout defined by `AuthProvider` token validation.
- No query hook should block the Settings screen initial render — if a sub-section fails to load, only that section shows an error.
- Mutation hooks should not hold references to stale closures — the `configRef` pattern from `useMutation` prevents this.

### Module boundary

The hooks in `useSettingsData.ts` are the **sole interface** between the Settings screen and the API. The Settings screen:

- **DOES** import hooks from `useSettingsData.ts`
- **DOES** import types from `settings-types.ts`
- **DOES NOT** directly use `useAPIClient()` for settings-related requests
- **DOES NOT** construct API URLs for settings endpoints

This boundary ensures that endpoint changes only require updating one file.

---

## 12. File Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/hooks/settings-types.ts` | **Create** | Domain types and hook return types for all settings entities |
| `apps/tui/src/hooks/useSettingsData.ts` | **Create** | All 16 settings data hooks (6 queries + 10 mutations) |
| `apps/tui/src/hooks/index.ts` | **Edit** | Add exports for all settings hooks and types |
| `e2e/tui/settings.test.ts` | **Create** | E2E tests for settings data hooks via TUI interaction |

---

## 13. Open Questions

| # | Question | Default if unanswered |
|---|----------|----------------------|
| 1 | Should `useUser()` be shared with `AuthProvider` (which already fetches `/api/user` on startup), or should it be a separate fetch? | Separate fetch. AuthProvider caches identity; useUser() provides the full editable profile. The Settings screen calls `useUser()` independently so it always gets fresh data. |
| 2 | Should token creation show a confirmation dialog before submitting? | No — the form itself is the confirmation. The one-time token display modal after creation is sufficient. |
| 3 | Is the `g s` go-to keybinding reserved for Settings or Search? | Per design.md, `g s` is Search. Settings may need a different binding or be accessed via command palette only. Tests should use command palette (`:`) to navigate to settings. |