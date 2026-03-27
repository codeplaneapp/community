# Research: tui-wiki-screen-scaffold

## 1. Directory & Router Registration

- **Router Types (`apps/tui/src/router/types.ts`)**:
  - The `ScreenName` enum currently defines `Wiki` and `WikiDetail` under the `Repo-scoped screens` section.
  - **Missing**: `WikiCreate` needs to be added to the `ScreenName` enum.

- **Router Registry (`apps/tui/src/router/registry.ts`)**:
  - `Wiki` and `WikiDetail` are already registered using the generic `PlaceholderScreen` component.
  - You will need to import your newly created components (`WikiListScreen`, `WikiDetailView`, `WikiCreateForm`) from `apps/tui/src/screens/Wiki/index.tsx` and replace the placeholders.
  - **Missing**: Add a new registry entry for `[ScreenName.WikiCreate]`, setting `requiresRepo: true` and adding an appropriate `breadcrumbLabel`.

## 2. Go-To Keybindings (`g k`)

- **Go-To Bindings (`apps/tui/src/navigation/goToBindings.ts`)**:
  - **Status**: The `g k` binding is actually **already registered** in the codebase:
    `{ key: "k", screen: ScreenName.Wiki, requiresRepo: true, description: "Wiki" }`
  - No new binding logic is required here unless behavior deviates from standard repo-scoped execution (which is natively handled in `executeGoTo`).

## 3. Command Palette

- **Command Registry (`apps/tui/src/commands/commandRegistry.ts`)**:
  - **Status**: The `apps/tui/src/commands/` directory is currently empty, and references in `apps/tui/src/components/OverlayLayer.tsx` indicate that the command palette itself is a "pending TUI_COMMAND_PALETTE implementation".
  - **Action**: You should proceed with scaffolding `apps/tui/src/commands/commandRegistry.ts` (or the expected registry structure) and export the `:wiki` and `:wiki <slug>` parsing logic so that it integrates cleanly once the palette UI is finalized.

## 4. Deep-Link Launch Arguments

- **Terminal CLI parsing (`apps/tui/src/lib/terminal.ts`)**:
  - `parseCLIArgs` currently parses `--repo`, `--screen`, and `--debug` into the `TUILaunchOptions` interface.
  - **Action**: Update `TUILaunchOptions` to include `slug?: string;` and update the `switch` statement in `parseCLIArgs` to parse `--slug`.

- **TUI Entrypoint (`apps/tui/src/index.tsx`)**:
  - `buildInitialStack` is called with `{ screen: launchOptions.screen, repo: launchOptions.repo }`.
  - **Action**: Update this call to pass `slug: launchOptions.slug`.

- **Deep Link Navigation (`apps/tui/src/navigation/deepLinks.ts`)**:
  - `DeepLinkArgs` currently supports `screen`, `repo`, `sessionId`, and `org`.
  - **Action**: Add `slug?: string;` to `DeepLinkArgs`.
  - The `buildInitialStack` function correctly handles pushing `ScreenName.Wiki` if `args.screen === "wiki"`. 
  - **Action**: Add logic so that if `args.screen === "wiki"` and `args.slug` is provided, it pushes `ScreenName.WikiDetail` with `{ slug: args.slug }` so that the stack mirrors `[Dashboard, RepoOverview, Wiki, WikiDetail]` properly.

## 5. Scaffold Directories
- You will need to manually create the new `apps/tui/src/screens/Wiki` directory, as it does not exist yet, and wire the placeholders appropriately.