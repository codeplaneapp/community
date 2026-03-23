# Implementation Plan: TUI Wiki Screen Scaffold

## Phase 1: Scaffold Wiki Components
**Files to create in `apps/tui/src/screens/Wiki/`:**

1. **`WikiListScreen.tsx`**
   - Import `<box>` and `<text>` from `@opentui/react`.
   - Import `useScreen` (or equivalent context hook) to set breadcrumbs (`"Wiki"`).
   - Render a placeholder: `<text>Wiki List Placeholder</text>`.

2. **`WikiDetailView.tsx`**
   - Import `<box>` and `<text>`.
   - Read `params.slug` from the navigation context.
   - Set breadcrumb: `"Wiki > {slug}"`.
   - Render: `<text>Wiki Detail: {slug}</text>`.

3. **`WikiCreateForm.tsx`**
   - Import `<box>` and `<text>`.
   - Set breadcrumb: `"Wiki > Create"`.
   - Render: `<text>Wiki Create Form</text>`.

4. **`index.tsx`**
   - Export the three components above.

## Phase 2: Router Registration
1. **`apps/tui/src/router/types.ts`**
   - Add `WikiCreate` to the `ScreenName` enum under the `Repo-scoped screens` section.
   - Update screen params typing to ensure `WikiDetail` requires `{ slug: string }`.

2. **`apps/tui/src/router/registry.ts`**
   - Import the new components from `apps/tui/src/screens/Wiki/index.tsx`.
   - Replace the generic `PlaceholderScreen` entries for `Wiki` and `WikiDetail` with `WikiListScreen` and `WikiDetailView`.
   - Add a new entry for `WikiCreate`:
     ```typescript
     [ScreenName.WikiCreate]: {
       component: WikiCreateForm,
       requiresRepo: true,
     },
     ```

## Phase 3: Deep-Link & CLI Integration
1. **`apps/tui/src/lib/terminal.ts`**
   - Update the `TUILaunchOptions` interface to include `slug?: string;`.
   - In the `parseCLIArgs` function, add logic to parse `--slug <value>` and attach it to the returned options object.

2. **`apps/tui/src/index.tsx`**
   - Pass the newly extracted `slug` from `launchOptions` into the `buildInitialStack` call.

3. **`apps/tui/src/navigation/deepLinks.ts`**
   - Add `slug?: string` to `DeepLinkArgs`.
   - Update `buildInitialStack` logic:
     - If `args.screen === "wiki"`, check for `args.slug`.
     - If `args.slug` is present, push `ScreenName.Wiki` then `ScreenName.WikiDetail` with `{ slug: args.slug }`. This ensures the router stack resolves properly to `[Dashboard, RepoOverview, Wiki, WikiDetail]`.
     - If `args.slug` is missing, push `ScreenName.Wiki` (resulting in `[Dashboard, RepoOverview, Wiki]`).

## Phase 4: Command Palette Wiring
1. **`apps/tui/src/commands/commandRegistry.ts`**
   - Scaffold this file if it is currently empty, laying the groundwork for the pending TUI_COMMAND_PALETTE.
   - Register the `:wiki` command:
     - Exact match for `:wiki` executes `navigation.push(ScreenName.Wiki)`.
     - Regex or argument-parsed match for `:wiki <slug>` executes `navigation.push(ScreenName.WikiDetail, { slug })`.
   - Add validation inside the command execution to check for active `repoContext`; if missing, trigger the repository selection prompt.

*Note: The `g k` go-to keybinding is confirmed to be already registered in `goToBindings.ts` mapped to `ScreenName.Wiki`. It will automatically begin working once the component is linked in the registry.*

## Phase 5: E2E Testing
Create a new test file `e2e/tui/wiki.test.ts` utilizing `@microsoft/tui-test`.

**Test Specifications to Implement:**
1. `wiki list placeholder renders correctly at standard size (120x40)`
   - Snapshot test for initial render of `WikiListScreen`.
2. `wiki detail placeholder renders correctly with slug param`
   - Snapshot test for `WikiDetailView` passing a mock slug in params.
3. `g k navigates to Wiki list when repo context is active`
   - Setup: Active repo context. Action: Send `g` then `k`. Assert: Screen text contains "Wiki List Placeholder".
4. `g k prompts for repo selection when no repo context is active`
   - Setup: Dashboard. Action: Send `g` then `k`. Assert: Repository selection modal appears.
5. `:wiki command palette entry opens Wiki list`
   - Setup: Active repo context. Action: Send `:`, type `wiki`, press `Enter`. Assert: Text shows "Wiki List Placeholder".
6. `:wiki <slug> command palette entry opens Wiki detail`
   - Setup: Active repo context. Action: Send `:`, type `wiki getting-started`, press `Enter`. Assert: Text shows "Wiki Detail: getting-started".
7. `CLI deep-link to wiki list builds correct stack`
   - Setup: Launch with `--screen wiki --repo test/repo`.
   - Assert: Breadcrumb matches `Dashboard › test/repo › Wiki`.
   - Action: Pop screen (`q`). Assert: Returns to RepoOverview.
8. `CLI deep-link to wiki detail builds correct stack`
   - Setup: Launch with `--screen wiki --repo test/repo --slug setup`.
   - Assert: Breadcrumb matches `Dashboard › test/repo › Wiki › setup`.
   - Action: Pop screen (`q`). Assert: Returns to Wiki list.