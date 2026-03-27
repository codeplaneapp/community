# Research: tui-org-context-provider

## 1. Provider Structure & Exports
- **Pattern**: Existing context providers (e.g., `AuthProvider`, `NavigationProvider`) are exported from an `index.ts` file.
- **Location**: You will need to create `apps/tui/src/providers/OrgContextProvider.tsx` and ensure it is exported from `apps/tui/src/providers/index.ts` (which currently has 17 lines of exports for other providers).

## 2. Dependencies & Data Hooks (`useOrg` and `Organization`)
- **Missing `@codeplane/ui-core` Dependency**: `apps/tui/package.json` (line 12) does not currently include `@codeplane/ui-core` as a dependency, nor does the package exist in the monorepo's `packages/` directory. The engineering specification `tui-org-data-hooks.md` indicates these hooks might be implemented locally in `apps/tui/src/hooks/useOrgData.ts` instead. For this ticket, you will likely need to stub the `useOrg` hook or import it from the local hooks directory if it is already present in another branch.
- **`Organization` Type Not Exported**: The `Organization` interface is defined in `packages/sdk/src/services/org.ts` (line 108), but it is **not exported** from that file, nor is it exported in `packages/sdk/src/index.ts`. To use `import type { Organization } from '@codeplane/sdk'`, the SDK must be updated to export this type, or you must define/stub it locally within the TUI package.

## 3. Deep Linking & Navigation Context
- **Screen Existence**: `ScreenName.OrgOverview` is defined in `apps/tui/src/router/types.ts` (line 40) and configured in the registry `apps/tui/src/router/registry.ts` (line 179).
- **Missing Deep Link Mapping**: The specification's E2E tests launch the TUI with `--screen org-overview --org acmecorp`. However, in `apps/tui/src/navigation/deepLinks.ts`, the `resolveScreenName` function does **not** map the string `"org-overview"` to `ScreenName.OrgOverview`. You will need to add `"org-overview": ScreenName.OrgOverview` to this map for the tests to work properly.
- **Keybindings**: The shortcut `g o` is already wired to `ScreenName.Organizations` in `apps/tui/src/navigation/goToBindings.ts` (line 19), so navigating from the top-level shortcut in the tests will work.

## 4. E2E Tests
- **Test File**: `e2e/tui/organizations.test.ts` does not exist yet. You will need to create it to write the integration tests specified.
- **Helper Configuration**: `e2e/tui/helpers.ts` successfully exports the `launchTUI` function (line 283) required by your test snippets.