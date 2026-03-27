# Implementation Plan: tui-org-context-provider

This plan outlines the steps to build the `OrgContextProvider` for nested organization screens in the Codeplane TUI. It incorporates fixes identified during research, such as missing SDK exports, adjusting local hook imports, and registering deep links.

## Step 1: Export `Organization` type from SDK
To strongly type the context provider, the `Organization` interface must be exported from the SDK.

**File:** `packages/sdk/src/services/org.ts`
*   **Action:** Add the `export` keyword to the `Organization` interface (around line 108).

**File:** `packages/sdk/src/index.ts`
*   **Action:** Ensure the type is exported from the SDK entry point.
```typescript
export type { Organization } from './services/org';
```

## Step 2: Register Deep Link Mapping
The E2E tests require launching the TUI directly into the `org-overview` screen. We need to map this CLI argument to the internal `ScreenName`.

**File:** `apps/tui/src/navigation/deepLinks.ts`
*   **Action:** Update the `resolveScreenName` mapping (or equivalent dictionary) to include `"org-overview"`.
```typescript
// Inside the routing map
"org-overview": ScreenName.OrgOverview,
```

## Step 3: Create the `OrgContextProvider`
Implement the context provider that wraps organization sub-screens, providing shared state and centralized error handling. Note: Based on research, we import `useOrg` from the local `useOrgData` hook rather than `@codeplane/ui-core` to match the current branch architecture.

**File:** `apps/tui/src/providers/OrgContextProvider.tsx`
*   **Action:** Create the file with the following implementation.
```tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { useOrg } from '../hooks/useOrgData';
import type { Organization } from '@codeplane/sdk';

export interface OrgContextValue {
  orgName: string;
  org: Organization;
  viewerRole: 'owner' | 'member' | 'none';
  refetch: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export interface OrgContextProviderProps {
  orgName: string;
  children: ReactNode;
}

export function OrgContextProvider({ orgName, children }: OrgContextProviderProps) {
  const { org, isLoading, error, refetch } = useOrg(orgName);

  if (isLoading) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text color="muted">Loading organization...</text>
      </box>
    );
  }

  if (error) {
    // Conceal 403 Forbidden as 404 Not Found for non-members of non-public orgs
    if (error.status === 404 || error.status === 403) {
      return (
        <box width="100%" height="100%" justifyContent="center" alignItems="center" flexDirection="column" gap={1}>
          <text color="error">Organization not found</text>
          <text color="muted">The organization "{orgName}" does not exist or you do not have permission to view it.</text>
        </box>
      );
    }
    
    // For other unexpected errors
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text color="error">Error loading organization: {error.message}</text>
      </box>
    );
  }

  if (!org) {
    return null; // Safety fallback
  }

  const value: OrgContextValue = {
    orgName,
    org,
    viewerRole: org.viewerRole || 'none',
    refetch,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgContext(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrgContext must be used within an OrgContextProvider');
  }
  return context;
}
```

## Step 4: Export Provider from Registry
**File:** `apps/tui/src/providers/index.ts`
*   **Action:** Add the export statement so the provider can be consumed alongside others.
```typescript
export * from './OrgContextProvider';
```

## Step 5: Implement Integration Tests
Create the E2E tests to validate that the loading, success, and security concealment logic works as expected within the terminal environment.

**File:** `e2e/tui/organizations.test.ts`
*   **Action:** Create the file with the following test suite.
```typescript
import { test, expect } from "bun:test";
import { launchTUI } from "./helpers";

test("OrgContextProvider renders organization content on success", async () => {
  const terminal = await launchTUI();
  
  await terminal.sendKeys("g", "o");
  await terminal.waitForText("Organizations");
  
  // Select a valid organization from the list
  await terminal.sendKeys("j", "Enter");
  
  // Provider should resolve and render the child screen
  await terminal.waitForText("Overview");
  expect(terminal.snapshot()).toMatchSnapshot();
});

test("OrgContextProvider handles 404 by rendering Not Found state", async () => {
  const terminal = await launchTUI({ args: ["--screen", "org-overview", "--org", "does-not-exist"] });
  
  await terminal.waitForText("Organization not found");
  await terminal.waitForText('The organization "does-not-exist" does not exist or you do not have permission to view it.');
  
  expect(terminal.snapshot()).toMatchSnapshot();
});

test("OrgContextProvider conceals 403 Forbidden as 404 Not Found", async () => {
  const terminal = await launchTUI({ args: ["--screen", "org-overview", "--org", "private-secret-org"] });
  
  // Should show the exact same 404 message to prevent information leakage
  await terminal.waitForText("Organization not found");
  await terminal.waitForText('The organization "private-secret-org" does not exist or you do not have permission to view it.');
  
  // Assert no unauthorized/403 text is leaked
  await terminal.waitForNoText("Forbidden");
  await terminal.waitForNoText("403");
});
```