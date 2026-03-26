# Engineering Specification: tui-wiki-screen-scaffold

## Title
Scaffold Wiki screen directory, register in screen router, wire go-to and command palette

## Type
Engineering

## Description
Create the Wiki screen entries in the screen registry and wire all navigation paths. This sets up the foundational skeleton for the Wiki feature in the TUI, allowing users to navigate to the list, detail, and create screens via keybindings, command palette, and CLI arguments, before the full data integration is built out.

## Scope
- Register `Wiki` screen in `apps/tui/src/router/screens.ts` with `requiresRepo: true`.
- Register `WikiDetail` screen with `requiresRepo: true`, params: `{ slug: string }`.
- Register `WikiCreate` screen with `requiresRepo: true`.
- Create `apps/tui/src/screens/Wiki/` directory structure.
- Wire `g k` go-to keybinding to push Wiki screen (requires repo context; if no repo active, prompt for repo selection).
- Register `:wiki` command palette entry.
- Register `:wiki <slug>` command palette entry for direct page navigation.
- Support `--screen wiki --repo owner/repo` deep-link (stack: `[Dashboard, RepoOverview, Wiki]`).
- Support `--screen wiki --repo owner/repo --slug <slug>` deep-link (stack: `[Dashboard, RepoOverview, Wiki, WikiDetail]`).
- Breadcrumbs: `Dashboard > owner/repo > Wiki` for list, `Dashboard > owner/repo > Wiki > <title>` for detail.
- Export placeholder components.

## Files
- `apps/tui/src/screens/Wiki/index.tsx`
- `apps/tui/src/screens/Wiki/WikiListScreen.tsx` (new)
- `apps/tui/src/screens/Wiki/WikiDetailView.tsx` (new)
- `apps/tui/src/screens/Wiki/WikiCreateForm.tsx` (new)
- `apps/tui/src/router/screens.ts` (update)
- `apps/tui/src/providers/KeybindingProvider.tsx` (update - or relevant go-to keybinding registry)
- `apps/tui/src/commands/commandRegistry.ts` (update - or relevant command palette registry)

## Dependencies
- `tui-screen-router`
- `tui-command-palette`
- `tui-goto-keybindings`

---

## Implementation Plan

1. **Scaffold Directory & Placeholder Components**
   - Create the directory `apps/tui/src/screens/Wiki/`.
   - **`WikiListScreen.tsx`**: Create a basic component using OpenTUI's `<box>` and `<text>` that renders "Wiki List Placeholder". Use the `useScreen` hook to set the breadcrumb to `"Wiki"`.
   - **`WikiDetailView.tsx`**: Create a component that reads `params.slug` from the navigation context. Render "Wiki Detail: {slug}". Set the breadcrumb to `"Wiki > {slug}"`.
   - **`WikiCreateForm.tsx`**: Create a component that renders "Wiki Create Form". Set the breadcrumb to `"Wiki > Create"`.
   - **`index.tsx`**: Export `WikiListScreen`, `WikiDetailView`, and `WikiCreateForm`.

2. **Register Screens in Router**
   - Open `apps/tui/src/router/screens.ts`.
   - Add `Wiki`, `WikiDetail`, and `WikiCreate` to the `ScreenName` type/enum.
   - Import the components from `apps/tui/src/screens/Wiki`.
   - Add entries to the `screenRegistry` object:
     ```typescript
     Wiki: { component: WikiListScreen, requiresRepo: true },
     WikiDetail: { component: WikiDetailView, requiresRepo: true },
     WikiCreate: { component: WikiCreateForm, requiresRepo: true },
     ```

3. **Wire Go-To Keybinding (`g k`)**
   - Locate the go-to keybinding logic (typically in `KeybindingProvider.tsx` or a centralized go-to hook).
   - Register the `g k` sequence.
   - Implementation logic: Check the current `repoContext`. If it exists, execute `navigation.push('Wiki')`. If it does not exist, trigger the repository selection modal/flow, and upon selection, push the `Wiki` screen.

4. **Wire Command Palette**
   - Open the command registry (`apps/tui/src/commands/commandRegistry.ts` or similar).
   - Register a static command for `:wiki` that calls `navigation.push('Wiki')`.
   - Register a dynamic/regex command or argument parser for `:wiki <slug>` that extracts the slug and calls `navigation.push('WikiDetail', { slug })`.

5. **Deep-Link Launch Arguments**
   - Locate the CLI argument parsing for the TUI entrypoint.
   - Ensure the `--screen wiki` argument is mapped to the `Wiki` screen.
   - If `--slug <slug>` is provided alongside `--screen wiki`, configure the initial navigation stack payload to initialize as `[Dashboard, RepoOverview, Wiki, WikiDetail({ slug })]`.
   - Ensure `--repo owner/repo` is correctly hydrating the `repoContext` before the initial render.

---

## Unit & Integration Tests

Create a new E2E test file: `e2e/tui/wiki.test.ts`.

**Terminal Snapshot Tests:**
1. `wiki list placeholder renders correctly at standard size (120x40)`
2. `wiki detail placeholder renders correctly with slug param`

**Keyboard Interaction & Navigation Tests:**
1. `g k navigates to Wiki list when repo context is active`
   - Setup: Launch TUI, navigate to a repo.
   - Action: Send `g` then `k`.
   - Assert: Screen text shows "Wiki List Placeholder" and breadcrumb contains `Wiki`.
2. `g k prompts for repo selection when no repo context is active`
   - Setup: Launch TUI (on Dashboard).
   - Action: Send `g` then `k`.
   - Assert: Repository selection modal is focused.
3. `:wiki command palette entry opens Wiki list`
   - Setup: Launch TUI, have active repo context.
   - Action: Send `:`, type `wiki`, press `Enter`.
   - Assert: Screen text shows "Wiki List Placeholder".
4. `:wiki <slug> command palette entry opens Wiki detail`
   - Setup: Launch TUI, have active repo context.
   - Action: Send `:`, type `wiki getting-started`, press `Enter`.
   - Assert: Screen text shows "Wiki Detail: getting-started".

**Deep-Link & Breadcrumb Tests:**
1. `CLI deep-link to wiki list builds correct stack`
   - Setup: `await launchTUI({ args: ['--screen', 'wiki', '--repo', 'test/repo'] })`
   - Assert: Breadcrumb text matches `Dashboard › test/repo › Wiki`.
   - Action: Send `q` (pop).
   - Assert: Screen returns to RepoOverview for `test/repo`.
2. `CLI deep-link to wiki detail builds correct stack`
   - Setup: `await launchTUI({ args: ['--screen', 'wiki', '--repo', 'test/repo', '--slug', 'setup'] })`
   - Assert: Breadcrumb text matches `Dashboard › test/repo › Wiki › setup`.
   - Action: Send `q` (pop).
   - Assert: Screen returns to Wiki list.