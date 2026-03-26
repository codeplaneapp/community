# Engineering Specification: tui-org-context-provider

## 1. Overview
The `OrgContextProvider` is a React context provider designed for the Codeplane TUI. It wraps organization sub-screens (Overview, Members, Teams, Team Detail, Settings) to provide shared state and centralized error handling. By lifting the `useOrg()` hook up to this provider, we prevent duplicate network requests across nested screens, handle 404 and 403 responses consistently (concealing 403s as 404s for security), and provide a clean `useOrgContext()` hook for child components to consume the organization data and viewer role.

## 2. Architecture Impact
This feature introduces a new context provider within the TUI's React component tree, specifically targeted at the organization routing branch. It sits below the `NavigationProvider` and wraps any screen component that requires organization context (e.g., `OrgOverviewScreen`, `OrgSettingsScreen`). 

It directly utilizes the OpenTUI intrinsic elements (`<box>`, `<text>`) to render loading and error states, ensuring that terminal-native layout constraints are respected without bleeding implementation details into the child screens.

## 3. Implementation Plan

### 3.1. `apps/tui/src/providers/OrgContextProvider.tsx`
Create the new provider and its associated consumer hook.

```tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { useOrg } from '@codeplane/ui-core';
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

### 3.2. `apps/tui/src/providers/index.ts` (Optional export)
Ensure the new provider is exported from the providers directory if an `index.ts` exists.
```typescript
export * from './OrgContextProvider';
```

## 4. Unit & Integration Tests

### 4.1. `e2e/tui/organizations.test.ts`
Add integration tests to verify the behavior of the provider when accessing organization screens using `@microsoft/tui-test`. These tests validate that the UI correctly handles the loading state, successful data injection, and the 404/403 concealment logic.

```typescript
import { test, expect } from "bun:test";
import { launchTUI } from "./helpers";

test("OrgContextProvider renders organization content on success", async () => {
  const terminal = await launchTUI();
  
  // Assume 'g o' goes to orgs, and we navigate to a specific org, or we deep link
  await terminal.sendKeys("g", "o");
  await terminal.waitForText("Organizations");
  
  // Select a valid organization (e.g., 'acmecorp') from the list
  await terminal.sendKeys("j", "Enter");
  
  // Provider should resolve and render the child screen
  await terminal.waitForText("Overview");
  expect(terminal.snapshot()).toMatchSnapshot();
});

test("OrgContextProvider handles 404 by rendering Not Found state", async () => {
  // Launch TUI deep-linked directly into a non-existent org
  const terminal = await launchTUI({ args: ["--screen", "org-overview", "--org", "does-not-exist"] });
  
  // Wait for the Error UI rendered by the Provider
  await terminal.waitForText("Organization not found");
  await terminal.waitForText('The organization "does-not-exist" does not exist or you do not have permission to view it.');
  
  expect(terminal.snapshot()).toMatchSnapshot();
});

test("OrgContextProvider conceals 403 Forbidden as 404 Not Found", async () => {
  // Launch TUI deep-linked into a private org the user is not a member of
  const terminal = await launchTUI({ args: ["--screen", "org-overview", "--org", "private-secret-org"] });
  
  // Should show the exact same 404 message to prevent information leakage
  await terminal.waitForText("Organization not found");
  await terminal.waitForText('The organization "private-secret-org" does not exist or you do not have permission to view it.');
  
  // Assert no unauthorized/403 text is leaked
  await terminal.waitForNoText("Forbidden");
  await terminal.waitForNoText("403");
});
```