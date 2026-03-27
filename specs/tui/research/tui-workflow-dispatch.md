# Research Document: `tui-workflow-dispatch` — Workflow Dispatch Modal

## 1. Executive Summary

This ticket implements a workflow dispatch overlay — a modal form that lets terminal users manually trigger a workflow run. The overlay is activated by pressing `d` on a focused workflow in the Workflow List screen. It dynamically generates form fields from the workflow definition's `on.workflow_dispatch.inputs` schema, supports three input types (string, boolean, choice), validates a ref input, and submits via `POST /api/repos/:owner/:repo/workflows/:id/dispatches`.

**Key finding:** The Workflows screen directory does NOT exist yet in `apps/tui/src/screens/`. No `Modal` component or `useModal` hook exists in the actual codebase — only in specs. The `WorkflowListScreen.tsx` (the parent component this overlay integrates with) is also unimplemented. All workflow hooks (`useDispatchWorkflow`, `useWorkflowDefinitions`, `workflow-types.ts`) exist only as specs in `specs/tui/apps/tui/src/hooks/`. There are no existing E2E tests for workflows in `e2e/tui/`.

---

## 2. File Inventory — What Exists vs. What Needs To Be Created

### 2.1 Files That Exist (Implemented in `apps/tui/src/`)

| File | Path | Purpose |
|------|------|--------|
| KeybindingProvider | `apps/tui/src/providers/KeybindingProvider.tsx` (166 lines) | Scope-based priority dispatch. `registerScope()` / `removeScope()` / `setActive()`. Single `useKeyboard()` call routes all input. |
| keybinding-types | `apps/tui/src/providers/keybinding-types.ts` (90 lines) | `KeyHandler` (key, description, group, handler, when?), `PRIORITY` enum (TEXT_INPUT=1, MODAL=2, GOTO=3, SCREEN=4, GLOBAL=5), `KeybindingScope`, `StatusBarHint` |
| OverlayManager | `apps/tui/src/providers/OverlayManager.tsx` (162 lines) | Manages 3 overlay types: help, command-palette, confirm. Registers MODAL scope. |
| overlay-types | `apps/tui/src/providers/overlay-types.ts` (27 lines) | `OverlayType`, `OverlayState`, `ConfirmPayload`, `OverlayContextType` |
| NavigationProvider | `apps/tui/src/providers/NavigationProvider.tsx` (194 lines) | Stack-based navigation, `push/pop/replace/reset`, `repoContext`, `createEntry()` |
| normalize-key | `apps/tui/src/providers/normalize-key.ts` (75 lines) | `normalizeKeyEvent()` and `normalizeKeyDescriptor()` for consistent key lookup |
| useScreenKeybindings | `apps/tui/src/hooks/useScreenKeybindings.ts` (56 lines) | Registers PRIORITY.SCREEN scope, auto-generates status bar hints from first 8 bindings |
| useTheme | `apps/tui/src/hooks/useTheme.ts` (31 lines) | Returns frozen `ThemeTokens` via context |
| useLayout | `apps/tui/src/hooks/useLayout.ts` (111 lines) | Returns `LayoutContext` with breakpoint, contentHeight, modalWidth/Height, sidebarVisible |
| useSpinner | `apps/tui/src/hooks/useSpinner.ts` (178 lines) | Braille/ASCII frame animation via OpenTUI Timeline engine, `useSyncExternalStore` |
| useOptimisticMutation | `apps/tui/src/hooks/useOptimisticMutation.ts` (94 lines) | Optimistic local state with revert on server error |
| useOverlay | `apps/tui/src/hooks/useOverlay.ts` (36 lines) | Accesses OverlayManager context |
| theme/tokens | `apps/tui/src/theme/tokens.ts` (263 lines) | ThemeTokens interface, RGBA values for truecolor/ansi256/ansi16, `statusToToken()` |
| breakpoint | `apps/tui/src/types/breakpoint.ts` (33 lines) | `Breakpoint` type, `getBreakpoint()` |
| StatusBar | `apps/tui/src/components/StatusBar.tsx` (96 lines) | Renders hints from `useStatusBarHints()`, error flash, auth confirmation, sync status |
| AppShell | `apps/tui/src/components/AppShell.tsx` (26 lines) | HeaderBar + content + StatusBar + OverlayLayer layout |
| OverlayLayer | `apps/tui/src/components/OverlayLayer.tsx` (91 lines) | Renders active overlay (placeholder content for help/command-palette/confirm) |
| ActionButton | `apps/tui/src/components/ActionButton.tsx` (59 lines) | Button with spinner loading state |
| ScreenRouter | `apps/tui/src/router/ScreenRouter.tsx` (28 lines) | Routes `currentScreen` to registered component |
| registry | `apps/tui/src/router/registry.ts` (208 lines) | Maps all 32 ScreenName values to PlaceholderScreen |
| logger | `apps/tui/src/lib/logger.ts` (32 lines) | `log(level, message)` writing to stderr, `logger.error/warn/info/debug` |
| telemetry | `apps/tui/src/lib/telemetry.ts` (62 lines) | `emit(name, properties)` writes JSON to stderr in debug mode |
| loading/constants | `apps/tui/src/loading/constants.ts` (40 lines) | `LOADING_TIMEOUT_MS`, `STATUS_BAR_ERROR_DURATION_MS`, `MIN_SAVING_BUTTON_WIDTH`, etc. |
| PlaceholderScreen | `apps/tui/src/screens/PlaceholderScreen.tsx` (23 lines) | Generic "Not yet implemented" screen |
| E2E helpers | `e2e/tui/helpers.ts` (492 lines) | `launchTUI()`, `createMockAPIEnv()`, `TUITestInstance` interface, `resolveKey()`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER` constants |

### 2.2 Files That Exist As Specs Only (in `specs/tui/`)

| Spec File | Target Path | Purpose |
|-----------|------------|--------|
| `specs/tui/apps/tui/src/hooks/workflow-types.ts` | `apps/tui/src/hooks/workflow-types.ts` | `WorkflowDefinition` (config: unknown), `WorkflowRun`, `MutationResult`, `HookError`, `RepoIdentifier`, `DispatchInput` |
| `specs/tui/apps/tui/src/hooks/useDispatchWorkflow.ts` | `apps/tui/src/hooks/useDispatchWorkflow.ts` | POST `/api/repos/:owner/:repo/workflows/:id/dispatches`, returns `MutationResult<DispatchInput, void>` |
| `specs/tui/apps/tui/src/hooks/useWorkflowDefinitions.ts` | `apps/tui/src/hooks/useWorkflowDefinitions.ts` | Paginated GET for `WorkflowDefinition[]` |
| `specs/tui/apps/tui/src/screens/Workflows/utils.ts` | `apps/tui/src/screens/Workflows/utils.ts` | Status icons, duration formatting, color mapping |
| `specs/tui/apps/tui/src/screens/Workflows/index.ts` | `apps/tui/src/screens/Workflows/index.ts` | Barrel exports from utils |
| `specs/tui/e2e/tui/workflows.test.ts` | `e2e/tui/workflows.test.ts` | 422 lines of workflow data hook E2E tests |
| `specs/tui/e2e/tui/helpers/workflows.ts` | `e2e/tui/helpers/workflows.ts` | `navigateToWorkflowRunDetail()`, `waitForLogStreaming()`, `createSSEInjectFile()` |

### 2.3 Files That Need To Be Created (This Ticket)

| File | Path | Purpose |
|------|------|--------|
| DispatchOverlay.types.ts | `apps/tui/src/screens/Workflows/components/DispatchOverlay.types.ts` | `ParsedDispatchInput`, `DispatchFormState`, `DispatchOverlayProps`, constants |
| useDispatchInputs.ts | `apps/tui/src/screens/Workflows/hooks/useDispatchInputs.ts` | Parses `workflow.config` → `ParsedDispatchInput[]` |
| useDispatchForm.ts | `apps/tui/src/screens/Workflows/hooks/useDispatchForm.ts` | Form state, validation, submission, error mapping |
| useStatusFlash.ts | `apps/tui/src/screens/Workflows/hooks/useStatusFlash.ts` | Timed status bar flash messages |
| BooleanToggle.tsx | `apps/tui/src/screens/Workflows/components/BooleanToggle.tsx` | `[true]`/`[false]` toggle component |
| DispatchOverlay.tsx | `apps/tui/src/screens/Workflows/components/DispatchOverlay.tsx` | Main overlay: Modal + dynamic form + keybindings |

### 2.4 Files That Need Modification (This Ticket)

| File | Path | Change |
|------|------|--------|
| WorkflowListScreen.tsx | `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx` | Add `d` keybinding, write-access gate, dispatchability check, overlay rendering |
| workflows.test.ts | `e2e/tui/workflows.test.ts` | Add 76 dispatch-specific E2E tests |

---

## 3. Dependency Status — Blockers and Prerequisites

### 3.1 CRITICAL: Missing Prerequisites

The eng spec lists these dependencies, none of which are implemented:

| Dependency | Status | Impact |
|-----------|--------|--------|
| `tui-workflow-list-screen` | **NOT IMPLEMENTED** — no `WorkflowListScreen.tsx` exists, no `apps/tui/src/screens/Workflows/` directory | The dispatch overlay INTEGRATES INTO this screen. Cannot wire `d` keybinding or render overlay without it. |
| `tui-workflow-data-hooks` | **SPEC ONLY** — hooks exist in `specs/tui/` but not copied to `apps/tui/src/hooks/` | `useDispatchWorkflow`, `useWorkflowDefinitions`, `workflow-types.ts` are all needed |
| `tui-modal-component` | **SPEC ONLY** — `Modal.tsx` and `useModal.ts` exist only in engineering spec | The overlay renders INSIDE a `<Modal>` component |
| `tui-form-component` | **SPEC ONLY** — exists as 69KB engineering spec | Not directly consumed (dispatch overlay uses custom form), but the spec's patterns inform the design |

### 3.2 What Can Be Built Independently

These new files have NO dependency on the missing prerequisites:
- `DispatchOverlay.types.ts` — Pure type definitions
- `useDispatchInputs.ts` — Pure parsing hook (only depends on `workflow-types.ts`)
- `useDispatchForm.ts` — Form state hook (depends on `useDispatchWorkflow` and types)
- `useStatusFlash.ts` — Pure timer hook with no external dependencies
- `BooleanToggle.tsx` — Presentational component (only needs `useTheme`)

The `DispatchOverlay.tsx` itself needs `<Modal>` which doesn't exist yet.

---

## 4. Keybinding Architecture — Exact Integration Pattern

### 4.1 Priority Dispatch System (from `KeybindingProvider.tsx`)

```
PRIORITY.TEXT_INPUT (1)  — OpenTUI focus system (not scope-based)
PRIORITY.MODAL (2)       — Overlay keybindings (Esc, Tab, Ctrl+S)
PRIORITY.GOTO (3)        — Go-to mode (g → d/i/l/r/w/n/s/a/o/f/k)
PRIORITY.SCREEN (4)      — Screen keybindings (j/k/Enter/d)
PRIORITY.GLOBAL (5)      — Always-active (q/Esc/Ctrl+C/?/:/g)
```

Dispatch resolution (line 71-88 of `KeybindingProvider.tsx`):
- Iterates active scopes sorted by priority ASC, LIFO within same priority
- First matching handler wins
- `when()` predicate checked at dispatch time; if false, tries next scope
- `event.preventDefault()` + `event.stopPropagation()` on match

### 4.2 How Overlay Keybindings Work

The existing `OverlayManager.tsx` (line 104-118) shows the pattern:
```typescript
const escapeBinding: KeyHandler = {
  key: normalizeKeyDescriptor("escape"),
  description: "Close overlay",
  group: "Overlay",
  handler: () => closeOverlayRef.current(),
};
const bindings = new Map<string, KeyHandler>();
bindings.set(escapeBinding.key, escapeBinding);
const scopeId = keybindingCtx.registerScope({
  priority: PRIORITY.MODAL,
  bindings,
  active: true,
});
```

The dispatch overlay needs the SAME pattern but with additional bindings (Tab, Shift+Tab, Ctrl+S, Enter, Space) merged into the MODAL scope.

### 4.3 Status Bar Hints Override (from `OverlayManager.tsx` line 121-124)

```typescript
const overlayHints: StatusBarHint[] = [
  { keys: "Esc", label: "close", order: 0 },
];
hintsCleanupRef.current = statusBarCtx.overrideHints(overlayHints);
```

The dispatch overlay should override with: `Tab:next │ Ctrl+S:dispatch │ Esc:cancel`

### 4.4 Screen Keybinding Registration (from `useScreenKeybindings.ts`)

The `d` keybinding on the WorkflowListScreen registers at `PRIORITY.SCREEN` (line 42):
```typescript
const scopeId = keybindingCtx.registerScope({
  priority: PRIORITY.SCREEN,
  bindings: bindingsMap,
  active: true,
});
```

The `when` predicate on `d` must return `false` when the overlay is open:
```typescript
{ key: "d", description: "Dispatch", group: "Actions",
  handler: handleDispatchPress,
  when: () => !modal.isOpen }
```

---

## 5. Theme & Styling Patterns

### 5.1 Theme Tokens (from `tokens.ts`)

All colors are `RGBA` objects from `@opentui/core`. The dispatch overlay uses:
- `theme.primary` — Focused field borders, active button text
- `theme.muted` — Labels, descriptions, disabled items
- `theme.border` — Unfocused field borders, separators
- `theme.surface` — Modal background
- `theme.error` — Error messages, validation errors
- `theme.success` — Success flash message
- `theme.warning` — Permission denied, non-dispatchable flash

### 5.2 Focus Indicator Pattern

All existing components use border color change for focus (from `ActionButton.tsx`):
```typescript
borderColor={disabled || isLoading ? theme.muted : theme.primary}
```

The dispatch overlay follows this: `borderColor={focused ? theme.primary : theme.border}`

### 5.3 Spinner Pattern (from `useSpinner.ts`)

Usage: `const spinner = useSpinner(isSubmitting)`  
Returns: Current braille frame ("⠋") or empty string  
The Dispatch button shows: `"Dispatching" + spinner.frame + " "`

---

## 6. Layout System — Responsive Sizing

### 6.1 Breakpoints (from `breakpoint.ts`)

```typescript
null: < 80×24 (unsupported — TerminalTooSmallScreen)
"minimum": 80×24 – 119×39
"standard": 120×40 – 199×59
"large": 200×60+
```

### 6.2 Modal Sizing (from `useLayout.ts`)

```typescript
getModalWidth:  large→"50%", standard→"60%", minimum→"90%"
getModalHeight: large→"50%", standard→"60%", minimum→"90%"
```

The dispatch overlay overrides with custom `ResponsiveSize` values:
- Width: minimum→"90%", standard→"50%", large→"50%"
- Height: "auto" at all breakpoints (content-driven)

### 6.3 Minimum Breakpoint Adaptations

At 80×24 (`breakpoint === "minimum"`):
- Gap between fields: 0 (instead of 1)
- Input descriptions: hidden
- Overlay width: 90% (72 cols)

---

## 7. Navigation System — Repo Context

### 7.1 How repoContext Works (from `NavigationProvider.tsx`)

```typescript
repoContext: extractRepoContext(stack)
// Scans stack LIFO for owner/repo params
function extractRepoContext(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const p = stack[i].params;
    if (p && p.owner && p.repo) return { owner: p.owner, repo: p.repo };
  }
  return null;
}
```

The dispatch overlay receives `repo` as a prop from the WorkflowListScreen, which gets it from `navigation.repoContext`.

### 7.2 Screen Registration (from `registry.ts`)

Workflows screen is registered as repo-scoped:
```typescript
[ScreenName.Workflows]: {
  component: PlaceholderScreen,  // Will be replaced with WorkflowListScreen
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: (p) => "Workflows",
}
```

---

## 8. API Contract — Dispatch Endpoint

### 8.1 useDispatchWorkflow Hook (from spec)

```typescript
export interface DispatchInput {
  workflowId: number;
  ref?: string;              // defaults to "main"
  inputs?: Record<string, unknown>;
}

export function useDispatchWorkflow(
  repo: RepoIdentifier,
  callbacks?: {
    onSuccess?: (input: DispatchInput) => void;
    onError?: (error: HookError, input: DispatchInput) => void;
  },
): MutationResult<DispatchInput, void>
```

Endpoint: `POST /api/repos/{owner}/{repo}/workflows/{id}/dispatches`  
Body: `{ ref: string, inputs?: Record<string, unknown> }`  
Success: 204 No Content  
Error responses: 400, 401, 403, 404, 409, 429, 500+

### 8.2 WorkflowDefinition Type (from spec)

```typescript
export interface WorkflowDefinition {
  id: number;
  repository_id: number;
  name: string;
  path: string;
  config: unknown;  // Opaque — parsed by useDispatchInputs
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

The `config` field is typed as `unknown`. It may arrive as a JSON object or JSON string. The `useDispatchInputs` hook handles both.

---

## 9. E2E Test Infrastructure

### 9.1 Test Framework (from `e2e/tui/helpers.ts`)

- **Test runner:** `bun:test` (Bun's built-in test runner)
- **Terminal emulation:** `@microsoft/tui-test` with `@xterm/headless` for PTY
- **TUI launch:** `launchTUI(options)` spawns `bun run src/index.tsx` with real PTY
- **Snapshot testing:** `expect(tui.snapshot()).toMatchSnapshot()`

### 9.2 Key Test Helpers

```typescript
// Available in e2e/tui/helpers.ts
launchTUI({ cols, rows, args, env })  → TUITestInstance
createMockAPIEnv({ apiBaseUrl, token, disableSSE })  → Record<string, string>
createTestCredentialStore(token?)  → { path, token, cleanup }

// TUITestInstance methods
tui.sendKeys(...keys)     // Resolves key names ("Enter", "Tab", "ctrl+s", etc.)
tui.sendText(text)        // Writes literal text
tui.waitForText(text, timeout?)
tui.waitForNoText(text, timeout?)
tui.snapshot()            // Full terminal buffer as string
tui.getLine(lineNumber)   // Single terminal line
tui.resize(cols, rows)    // Resize with 200ms delay
tui.terminate()           // Kill process, cleanup temp dir
```

### 9.3 Environment Variables

```typescript
WRITE_TOKEN = process.env.CODEPLANE_WRITE_TOKEN ?? "codeplane_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
READ_TOKEN = process.env.CODEPLANE_READ_TOKEN ?? "codeplane_feedfacefeedfacefeedfacefeedfacefeedface"
OWNER = process.env.CODEPLANE_E2E_OWNER ?? "alice"
API_URL = process.env.API_URL ?? "http://localhost:3000"
```

### 9.4 Existing Test Patterns (from `e2e/tui/repository.test.ts`)

Tests use `bun:test` with `describe/test/expect`. Three patterns:
1. **File existence checks:** `expect(existsSync(path)).toBe(true)`
2. **Runtime import validation:** `bunEval('import {...} from ...; console.log(typeof ...)')`
3. **Full TUI launch + interaction:** `launchTUI → waitForText → sendKeys → snapshot → terminate`

### 9.5 Workflow Test Helpers (from spec)

```typescript
// specs/tui/e2e/tui/helpers/workflows.ts
navigateToWorkflowRunDetail(terminal, runIndex)  // g,f → Enter → j*n → Enter
waitForLogStreaming(terminal, timeoutMs)          // Polls for streaming indicators
createSSEInjectFile(dir)                         // Creates JSONL file for SSE mock
```

---

## 10. Logging System (from `lib/logger.ts`)

```typescript
type LogLevel = "error" | "warn" | "info" | "debug";
log(level, message) → writes to stderr as [ISO_TIMESTAMP] [LEVEL] message\n
// Controlled by:
CODEPLANE_TUI_LOG_LEVEL env var (default: "error")
CODEPLANE_TUI_DEBUG=true → sets level to "debug"
```

The dispatch overlay should use `logger.debug(...)` for opened/parsed/changed events, `logger.info(...)` for submitted/succeeded/cancelled, `logger.warn(...)` for failed/rate-limited/blocked, and `logger.error(...)` for auth/permission/render/network errors.

---

## 11. Telemetry System (from `lib/telemetry.ts`)

```typescript
emit(name: string, properties?: Record<string, string | number | boolean>)
// Only writes to stderr when CODEPLANE_TUI_DEBUG=true
```

Events to emit:
- `tui.workflow_dispatch.opened`
- `tui.workflow_dispatch.submitted`
- `tui.workflow_dispatch.succeeded`
- `tui.workflow_dispatch.failed`
- `tui.workflow_dispatch.cancelled`
- `tui.workflow_dispatch.blocked`
- `tui.workflow_dispatch.denied`

---

## 12. OpenTUI Component API Reference

The dispatch overlay uses these OpenTUI primitives:

| Component | Props | Usage |
|-----------|-------|-------|
| `<box>` | flexDirection, gap, paddingX/Y, border, borderStyle, borderColor, backgroundColor, position, width, height, zIndex, flexGrow, minWidth | Layout container |
| `<text>` | fg, bold, dimmed, attributes | Text rendering |
| `<input>` | value, onInput, focused, disabled | String field input |
| `<select>` | options ([{name, value}]), value, onChange, focused, disabled | Dropdown selection |
| `<scrollbox>` | scrollY, flexGrow | Scrollable container for many inputs |

OpenTUI hooks used:
- `useKeyboard` — Single centralized keyboard handler (already in `KeybindingProvider`)
- `useTerminalDimensions` — Terminal size (already in `useLayout`)

---

## 13. Package Dependencies

From `apps/tui/package.json`:
```json
{
  "dependencies": {
    "@opentui/core": "0.1.90",
    "@opentui/react": "0.1.90",
    "react": "19.2.4",
    "@codeplane/sdk": "workspace:*"
  },
  "devDependencies": {
    "@microsoft/tui-test": "^0.0.3",
    "typescript": "^5"
  }
}
```

**Note:** The spec imports from `@codeplane/ui-core` which is NOT a declared dependency. The actual dependency is `@codeplane/sdk`. The workflow hooks in specs import from `@codeplane/ui-core/src/hooks/internal/useMutation.js` etc. — these imports will need to be adapted to the actual package structure when implementing.

---

## 14. Key Architectural Decisions

### 14.1 Why Not Use Generic FormComponent

The generic `FormComponent` supports: `input`, `textarea`, `select` field types.  
The dispatch overlay needs: `input`, `select`, AND **boolean toggle** (`[true]`/`[false]` with Space/Enter cycling).  
Adding boolean toggle to the generic form would pollute its interface for a single consumer.  
Decision: Custom form rendering inside the overlay, reusing `<Modal>` for focus trap/dismiss/border.

### 14.2 Why PRIORITY.MODAL for Form Navigation

The dispatch overlay renders INSIDE a `<Modal>`. Modal registers at `PRIORITY.MODAL` (2).  
The overlay's Tab/Shift+Tab/Ctrl+S/Enter must also be at `PRIORITY.MODAL` to intercept before SCREEN-level bindings (j/k/Enter/d from the WorkflowListScreen).  
Decision: Merge form keybindings into the Modal's MODAL scope via `keybindings` prop.

### 14.3 Double-Submit Prevention

Both `isSubmitting` state (for rendering) AND `isSubmittingRef` ref (for synchronous guard) are needed.  
Reason: React state updates are async — two rapid Ctrl+S presses could both read `isSubmitting === false` before the first setState takes effect.  
The ref provides immediate synchronous checking.

### 14.4 Space/Enter `when` Predicates

The `handleSpace` and `handleEnter` keybinding handlers have `when()` predicates that check the focused field type.  
This prevents intercepting Space when typing in a string input (where Space should type a space character).  
For choice fields, Enter opens the dropdown natively via OpenTUI's `<select>` — it must NOT be intercepted.

---

## 15. Error Handling Patterns

### 15.1 Error Classification (from `useRepoFetch.ts` pattern)

```typescript
401 → auth_error → Close overlay, delegate to AuthProvider's 401 interceptor
400 → "Invalid dispatch inputs" — inline error, overlay stays open
403 → "Permission denied — write access required" — inline error
404 → "Workflow not found" — inline error
409 → "Workflow is inactive" — inline error  
429 → "Rate limited. Retry in {Retry-After}s." — inline error
500+ → "Server error. Please try again." — inline error
Network → "Network error. Press Ctrl+S to retry." — inline error
Timeout → "Request timed out" — inline error
```

All non-401 errors keep overlay open with fields re-enabled for retry.

### 15.2 Status Bar Error Flash (existing pattern from `useOptimisticMutation.ts`)

```typescript
// From loading/constants.ts
STATUS_BAR_ERROR_DURATION_MS = 5_000
```

The dispatch overlay uses a custom `useStatusFlash` hook with 3000ms duration for success/warning messages.

---

## 16. Implementation Order Recommendation

Given the dependency chain:

1. **First** — Create `workflow-types.ts` in `apps/tui/src/hooks/` (copy from spec)
2. **First** — Create `useDispatchWorkflow.ts` in `apps/tui/src/hooks/` (copy from spec, adapt imports)
3. **First** — Create `apps/tui/src/screens/Workflows/` directory structure
4. **First** — Create `DispatchOverlay.types.ts` (pure types, no deps)
5. **First** — Create `useStatusFlash.ts` (pure hook, no deps)
6. **First** — Create `useDispatchInputs.ts` (depends only on types)
7. **Second** — Create `BooleanToggle.tsx` (depends on useTheme)
8. **Second** — Create `useDispatchForm.ts` (depends on useDispatchWorkflow, types)
9. **Third** — Implement/obtain `Modal.tsx` and `useModal.ts` (prerequisite)
10. **Fourth** — Create `DispatchOverlay.tsx` (depends on all above + Modal)
11. **Fifth** — Implement or stub `WorkflowListScreen.tsx` and wire the overlay
12. **Sixth** — Write E2E tests

---

## 17. Risks and Open Questions

1. **`@codeplane/ui-core` vs `@codeplane/sdk`:** The spec hooks import from `@codeplane/ui-core` but `package.json` only depends on `@codeplane/sdk`. Need to verify if `@codeplane/sdk` re-exports `useMutation`, `useAPIClient`, `parseResponseError`.

2. **Modal component not implemented:** The `<Modal>` component is the single biggest dependency. The spec defines its interface (visible, onDismiss, title, children, width, height, dismissOnEsc, keybindings) but no implementation exists in `apps/tui/src/`.

3. **WorkflowListScreen not implemented:** The parent screen that hosts the dispatch overlay doesn't exist. The `d` keybinding wiring, focused workflow state, and overlay rendering all depend on it.

4. **No `hasWriteAccess` infrastructure:** The spec mentions checking `hasWriteAccess` from a "repo permissions context" but no such context exists in the implemented codebase.

5. **Test fixtures:** The 76 E2E tests require specific test workflow definitions seeded in the database. No fixture creation infrastructure exists for workflow definitions.

6. **Choice field dropdown:** The spec assumes OpenTUI's `<select>` component handles Enter-to-open, j/k navigation, Enter-to-select, and Esc-to-close natively. This needs verification against OpenTUI's actual `<select>` implementation.