# Research Findings for `tui-nav-chrome-eng-02`

## 1. Existing TUI Code and Patterns (`apps/tui/`)

### Provider Stack (`apps/tui/src/index.tsx`)
The application root explicitly wraps `AppShell` with a series of context providers in a specific order:
```tsx
<ErrorBoundary>
  <ThemeProvider>
    <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
      <SSEProvider>
        <NavigationProvider initialStack={initialStack}>
          <GlobalKeybindings>
            <AppShell />
          </GlobalKeybindings>
        </NavigationProvider>
      </SSEProvider>
    </AuthProvider>
  </ThemeProvider>
</ErrorBoundary>
```
**Relevance to spec**: The engineering spec notes the `KeybindingProvider` needs to sit at the bottom of the provider stack wrapping `AppShell`. Right now, `GlobalKeybindings` serves a similar role but as a component that invokes the hook directly. We will be injecting `<KeybindingProvider>` around `AppShell`, replacing or restructuring `GlobalKeybindings` to rely on the new `KeybindingProvider`.

### Global Keybindings (`apps/tui/src/components/GlobalKeybindings.tsx`)
Currently, this component uses `useKeyboard` directly from `@opentui/react`. It tracks a `goToMode` via a `useState` and `useRef` for timeouts, intercepting key presses to perform global actions like quitting (`q`, `escape`, `ctrl+c`) and jumping around screens (`g` mode).

**Relevance to spec**: The spec dictates that this component will be refactored. The `GlobalKeybindings.tsx` will no longer call `useKeyboard` directly; instead, it will utilize the newly minted `useGlobalKeybindings()` hook. The `KeybindingProvider` will be the sole component interacting with `useKeyboard()`, effectively decoupling local component event interception from the raw keyboard event stream.

### Navigation Provider (`apps/tui/src/providers/NavigationProvider.tsx`)
The `NavigationProvider` utilizes a stack-based routing system with methods like `push`, `pop`, `replace`, and `reset`. The `GlobalKeybindings` utilizes `nav.pop()` on `q` and `escape` to pop the current screen or quit if un-poppable.

### Status Bar (`apps/tui/src/components/StatusBar.tsx`)
The `StatusBar` presently uses hardcoded hint strings:
```tsx
const allHints = "j/k:navigate  Enter:select  q:back  ?:help  ::command";
const minHints = "q:back  ?:help";
```
**Relevance to spec**: The current hardcoded values need to be made dynamic via the new `StatusBarHintsContext`. Components will consume `useStatusBarHints()` to display priority-layered, context-aware keyboard hints depending on active scopes rather than relying on standard strings.

## 2. OpenTUI Hook Context (`context/opentui/`)

Although the local `context/opentui/` directory was not found in the root, grep searches and codebase references show that OpenTUI handles input entirely through `@opentui/react` and `@opentui/core`.
- `useKeyboard` is supplied by `@opentui/react` and binds to raw terminal keystrokes.
- The keys are fed into the system with an object interface (e.g. `{ name: string; ctrl?: boolean; shift?: boolean }`), which corresponds to `KeyEvent` from `@opentui/core`.

**Relevance to spec**: The normalization module `normalize-key.ts` outlined in the spec uses this exact structure, parsing string names (`q`, `escape`, `return`), and inspecting `ctrl`/`shift`/`meta` keys, establishing a unified string descriptor format (like `ctrl+c` or `G`) compatible with the overarching priority dispatch dictionary.

## 3. Shared Data Hooks (`packages/ui-core/`)
The shared `@codeplane/ui-core` handles business logic and fetching (e.g., workspaces, workflows, agents, issues), demonstrating a clean decoupling between the terminal display components and API logic. This highlights the architectural approach where `KeybindingProvider` focuses strictly on terminal interaction infrastructure without muddling business state.

## 4. Alignment with the Engineering Specification
The current codebase is well-prepared for the layered priority dispatch system:
- **No Conflicting Overlays**: The global keystroke interception is localized strictly to `GlobalKeybindings.tsx`, meaning that migrating the `useKeyboard()` call to `KeybindingProvider` will not cause widespread breakage.
- **Go-to Scope Isolation**: The existing `goToMode` state block inside `GlobalKeybindings` aligns flawlessly with the specification that Go-To mode will act as a separate, overriding scope. Since the infrastructure supports temporal modifiers (P3: `GOTO`), this can be cleanly implemented via the `overrideHints` function of the `StatusBarHintsContextType`.
- **Scope Hierarchy Verification**: Creating the `PRIORITY.MODAL`, `PRIORITY.GOTO`, `PRIORITY.SCREEN`, and `PRIORITY.GLOBAL` stacks provides a systemic fix to issues where global commands might incorrectly trigger while within modal inputs, seamlessly integrating into the `AppShell` and `ScreenRouter` lifecycle.