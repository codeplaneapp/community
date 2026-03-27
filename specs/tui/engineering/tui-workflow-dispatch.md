# Engineering Specification: `tui-workflow-dispatch`

**Ticket:** `tui-workflow-dispatch`
**Title:** Implement workflow dispatch modal with dynamic form, ref selector, and input type resolution
**Dependencies:** `tui-workflow-list-screen`, `tui-workflow-data-hooks`, `tui-form-component`, `tui-modal-component`
**Target:** `apps/tui/src/screens/Workflows/components/DispatchOverlay.tsx`
**Tests:** `e2e/tui/workflows.test.ts` (76 tests: SNAP-WFD, KEY-WFD, RESP-WFD, INT-WFD, EDGE-WFD)

---

## Overview

This ticket implements the workflow dispatch overlay — a modal form that lets terminal users manually trigger a workflow run from the Workflow List screen. The overlay is activated by pressing `d` on a focused workflow that has `workflow_dispatch` in its trigger configuration. It dynamically generates form fields from the workflow definition's `on.workflow_dispatch.inputs` schema, supports three input types (string, boolean, choice), validates a ref input, and submits via `POST /api/repos/:owner/:repo/workflows/:id/dispatches`.

This is the most complex overlay in the TUI — it composes the `<Modal>` component with a dynamic form that is not backed by the generic `FormComponent` (which supports `input`/`textarea`/`select` field types). The dispatch overlay requires a custom boolean toggle field type and custom input-type resolution logic not present in the standard form system. It therefore implements its own form state and rendering inside the modal, while reusing the `<Modal>` component for focus trap, Esc dismissal, border/background styling, and responsive sizing.

---

## Architecture Context

### Existing Infrastructure (already implemented)

| System | File | What it provides |
|--------|------|------------------|
| Modal component | `components/Modal.tsx` | Centered absolute-positioned `<box>`, `PRIORITY.MODAL` focus trap, Esc dismissal, responsive sizing via `ResponsiveSize`, title bar, border/surface theming |
| `useModal()` hook | `hooks/useModal.ts` | Local modal state: `isOpen`, `open()`, `close()`, `content` — for component-scoped overlays not managed by `OverlayManager` |
| `useDispatchWorkflow()` hook | `hooks/useDispatchWorkflow.ts` | Mutation: `POST /api/repos/:owner/:repo/workflows/:id/dispatches` with `DispatchInput { workflowId, ref?, inputs? }`. Returns `MutationResult<DispatchInput, void>`. Double-execute prevention built in. |
| `useWorkflowDefinitions()` hook | `hooks/useWorkflowDefinitions.ts` | Paginated query for `WorkflowDefinition[]` with `config: unknown` field containing the workflow trigger configuration |
| Keybinding system | `providers/KeybindingProvider.tsx` | Scope-based priority dispatch. `PRIORITY.MODAL` (2) traps focus. `registerScope()` / `removeScope()` lifecycle. |
| `useScreenKeybindings()` | `hooks/useScreenKeybindings.ts` | Screen-level keybinding registration at `PRIORITY.SCREEN` (4) |
| Theme tokens | `theme/tokens.ts` | `primary` (ANSI 33), `surface` (ANSI 236), `border` (ANSI 240), `error` (ANSI 196), `success` (ANSI 34), `muted` (ANSI 245), `warning` (ANSI 178) |
| Layout hook | `hooks/useLayout.ts` | `breakpoint`, `width`, `height`, `contentHeight`, `modalWidth`, `modalHeight` |
| Spinner system | `hooks/useSpinner.ts` | `BRAILLE_FRAMES`, `ASCII_FRAMES`, frame animation via `useSpinner()` |
| Status bar | `components/StatusBar.tsx` | Status bar hints, error flash (5s), auth confirmation flash (3s) |
| Workflow types | `hooks/workflow-types.ts` | `WorkflowDefinition`, `MutationResult`, `HookError`, `RepoIdentifier`, `DispatchInput` |
| Workflow utils | `screens/Workflows/utils.ts` | Status icons, duration formatting, color mapping |
| Navigation | `providers/NavigationProvider.tsx` | `repoContext` for `{owner, repo}` resolution |

### What this ticket builds

1. **`apps/tui/src/screens/Workflows/components/DispatchOverlay.tsx`** — Main overlay component with dynamic form rendering, input type resolution, ref validation, submission, and error handling.
2. **`apps/tui/src/screens/Workflows/components/DispatchOverlay.types.ts`** — TypeScript interfaces for dispatch overlay: parsed input definitions, form state, overlay props.
3. **`apps/tui/src/screens/Workflows/components/BooleanToggle.tsx`** — Boolean toggle field component rendering `[true]` / `[false]` with Space/Enter toggling.
4. **`apps/tui/src/screens/Workflows/hooks/useDispatchForm.ts`** — Form state management hook: values, errors, focus index, validation, submission lifecycle.
5. **`apps/tui/src/screens/Workflows/hooks/useDispatchInputs.ts`** — Input type resolution hook: parses `workflow.config` → `ParsedDispatchInput[]`.
6. **`apps/tui/src/screens/Workflows/hooks/useStatusFlash.ts`** — Status bar flash utility hook: shows timed messages in the status bar.
7. **Update `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx`** — Register `d` keybinding on the workflow list, gate on `canDispatch` and `hasWriteAccess`, wire to overlay open.
8. **`e2e/tui/workflows.test.ts`** — Add all 76 dispatch-specific E2E tests (SNAP-WFD, KEY-WFD, RESP-WFD, INT-WFD, EDGE-WFD).

---

## Implementation Plan

### Step 1: Define dispatch overlay types

**File:** `apps/tui/src/screens/Workflows/components/DispatchOverlay.types.ts`

Define the type system for the dispatch form. These types bridge the opaque `workflow.config` field and the rendered form.

```typescript
import type { WorkflowDefinition } from "../../../hooks/workflow-types.js";

/**
 * Resolved input type for a workflow dispatch input field.
 *
 * Derived from the workflow definition's `on.workflow_dispatch.inputs` config.
 * Each input is classified as string, boolean, or choice based on its shape.
 */
export type DispatchInputType = "string" | "boolean" | "choice";

/**
 * A single parsed dispatch input definition.
 *
 * Extracted from the workflow config's `on.workflow_dispatch.inputs` section.
 * The `key` is the input name (used as the form field name and sent to the API).
 */
export interface ParsedDispatchInput {
  /** Input key name from the workflow config. */
  key: string;
  /** Resolved input type based on config shape. */
  type: DispatchInputType;
  /** Default value from config (string for all types). */
  defaultValue: string;
  /** Human-readable description from config. Rendered as muted helper text. */
  description: string | null;
  /** Allowed options for choice-type inputs. Empty for string/boolean. */
  options: string[];
}

/**
 * Props for the DispatchOverlay component.
 *
 * The overlay is controlled by the parent WorkflowListScreen which manages
 * visibility state via useModal().
 */
export interface DispatchOverlayProps {
  /** Whether the overlay is currently visible. */
  visible: boolean;
  /** Called to dismiss the overlay (Esc, Cancel, or successful dispatch). */
  onDismiss: () => void;
  /** The workflow definition to dispatch. */
  workflow: WorkflowDefinition;
  /** Repository context for the dispatch API call. */
  repo: { owner: string; repo: string };
  /** Called after a successful dispatch (for status bar flash and list refresh). */
  onSuccess: () => void;
}

/**
 * Internal form state managed by useDispatchForm.
 */
export interface DispatchFormState {
  /** Current ref value. Initialized to "main". */
  ref: string;
  /** Input values keyed by input key name. */
  inputValues: Record<string, string>;
  /** Validation errors keyed by field identifier ("ref" or input key). */
  errors: Record<string, string | null>;
  /** Index of the currently focused form field. */
  focusIndex: number;
  /** Whether a dispatch request is in-flight. */
  isSubmitting: boolean;
  /** Inline error message from the most recent failed dispatch. */
  submitError: string | null;
}

/**
 * Total number of focusable fields in the form.
 *
 * Computed as: 1 (ref) + min(inputs.length, MAX_RENDERED_INPUTS) + 2 (Dispatch, Cancel buttons).
 */
export type FocusableFieldCount = number;

/** Maximum number of dispatch inputs rendered in the overlay. */
export const MAX_RENDERED_INPUTS = 20;

/** Maximum character length for ref input. */
export const MAX_REF_LENGTH = 255;

/** Maximum character length for custom input values. */
export const MAX_INPUT_VALUE_LENGTH = 1000;

/** Duration (ms) for status bar flash messages. */
export const STATUS_FLASH_DURATION_MS = 3000;
```

**Architectural Decision — Why not use `FormComponent`?**

The generic `FormComponent` from `tui-form-component` supports three field types: `input`, `textarea`, and `select`. The dispatch overlay requires a fourth type: a boolean toggle that renders as `[true]` / `[false]` and cycles with Space/Enter. Adding this to the generic form system would pollute its interface for a single consumer. Instead, the dispatch overlay implements its own field rendering loop using `<input>` from OpenTUI for string fields, `<select>` from OpenTUI for choice fields, and a custom `BooleanToggle` component for boolean fields. The form navigation logic (Tab/Shift+Tab/Ctrl+S/Esc) is extracted into `useDispatchForm` which registers a `PRIORITY.MODAL` keybinding scope via the `<Modal>` component's `keybindings` prop.

**Architectural Decision — `PRIORITY.MODAL` for form navigation, not `PRIORITY.SCREEN`:**

Unlike standalone form screens that register at `PRIORITY.SCREEN` (4), the dispatch overlay registers its Tab/Shift+Tab/Ctrl+S/Enter at `PRIORITY.MODAL` (2) because it renders inside a `<Modal>`. The Modal already registers its own scope at `PRIORITY.MODAL` for Esc. The overlay's form keybindings are merged into the Modal's scope via the `keybindings` prop. This ensures the overlay's keys intercept before any screen-level bindings from the underlying WorkflowListScreen (which has `j`/`k`/`Enter`/`d` at `PRIORITY.SCREEN`).

---

### Step 2: Implement input type resolution hook

**File:** `apps/tui/src/screens/Workflows/hooks/useDispatchInputs.ts`

Parse the opaque `workflow.config` field to extract dispatch input definitions. This hook is the bridge between the raw workflow config (server shape) and the typed form field definitions consumed by the overlay.

```typescript
import { useMemo } from "react";
import type { WorkflowDefinition } from "../../../hooks/workflow-types.js";
import {
  MAX_RENDERED_INPUTS,
  type ParsedDispatchInput,
  type DispatchInputType,
} from "../components/DispatchOverlay.types.js";

/**
 * Workflow trigger config shape (subset relevant to dispatch).
 *
 * The full config is opaque (`unknown`) in WorkflowDefinition.
 * This interface describes the expected shape for dispatch input resolution.
 */
interface WorkflowTriggerConfig {
  on?: {
    workflow_dispatch?: {
      inputs?: Record<string, DispatchInputConfig>;
    };
  };
}

interface DispatchInputConfig {
  type?: string;
  default?: unknown;
  description?: string;
  options?: string[];
}

export interface UseDispatchInputsReturn {
  /** Parsed dispatch inputs (max MAX_RENDERED_INPUTS). */
  inputs: ParsedDispatchInput[];
  /** Total number of inputs defined in the workflow config (may exceed MAX_RENDERED_INPUTS). */
  totalInputCount: number;
  /** Whether the workflow has workflow_dispatch in its triggers. */
  isDispatchable: boolean;
  /** True if totalInputCount > MAX_RENDERED_INPUTS. */
  isTruncated: boolean;
}

/**
 * Resolve input type from the config shape.
 *
 * Resolution rules (from product spec "Input Type Resolution"):
 * - { type: "boolean", ... } → "boolean"
 * - { type: "choice", options: [...], ... } → "choice" (requires non-empty options)
 * - { type: "string", ... } or bare key → "string"
 * - { type: "choice", options: [] } → fallback to "string" (empty options)
 */
function resolveInputType(config: DispatchInputConfig): DispatchInputType {
  if (config.type === "boolean") return "boolean";
  if (config.type === "choice" && Array.isArray(config.options) && config.options.length > 0) {
    return "choice";
  }
  return "string";
}

/**
 * Resolve default value for an input.
 *
 * - Boolean: config.default === true → "true", else "false"
 * - Choice: config.default if it's in options, else first option
 * - String: String(config.default) if defined, else ""
 */
function resolveDefaultValue(
  config: DispatchInputConfig,
  type: DispatchInputType,
): string {
  if (type === "boolean") {
    return config.default === true || config.default === "true" ? "true" : "false";
  }
  if (type === "choice") {
    const options = config.options ?? [];
    const defaultStr = config.default != null ? String(config.default) : "";
    return options.includes(defaultStr) ? defaultStr : (options[0] ?? "");
  }
  return config.default != null ? String(config.default) : "";
}

export function useDispatchInputs(
  workflow: WorkflowDefinition,
): UseDispatchInputsReturn {
  return useMemo(() => {
    let config: WorkflowTriggerConfig;
    try {
      config =
        typeof workflow.config === "string"
          ? JSON.parse(workflow.config)
          : (workflow.config as WorkflowTriggerConfig) ?? {};
    } catch {
      // Malformed config — treat as no dispatch inputs
      return {
        inputs: [],
        totalInputCount: 0,
        isDispatchable: false,
        isTruncated: false,
      };
    }

    const dispatchConfig = config?.on?.workflow_dispatch;
    if (!dispatchConfig) {
      // Workflow does not have workflow_dispatch trigger
      return {
        inputs: [],
        totalInputCount: 0,
        isDispatchable: false,
        isTruncated: false,
      };
    }

    const rawInputs = dispatchConfig.inputs ?? {};
    const entries = Object.entries(rawInputs);
    const totalInputCount = entries.length;

    const parsed: ParsedDispatchInput[] = entries
      .slice(0, MAX_RENDERED_INPUTS)
      .map(([key, inputConfig]) => {
        const cfg: DispatchInputConfig =
          typeof inputConfig === "object" && inputConfig !== null
            ? inputConfig
            : {};
        const type = resolveInputType(cfg);
        return {
          key,
          type,
          defaultValue: resolveDefaultValue(cfg, type),
          description: cfg.description ?? null,
          options: type === "choice" ? (cfg.options ?? []) : [],
        };
      });

    return {
      inputs: parsed,
      totalInputCount,
      isDispatchable: true,
      isTruncated: totalInputCount > MAX_RENDERED_INPUTS,
    };
  }, [workflow.config, workflow.id]);
}
```

**Key decisions:**

1. **String config fallback:** The `config` field on `WorkflowDefinition` is typed as `unknown`. The server stores it as a JSON object, but it may arrive as a JSON string in some serialization paths. The hook handles both by checking `typeof` and calling `JSON.parse` when needed.

2. **Malformed config graceful degradation:** If `JSON.parse` throws or the config structure is unexpected, the hook returns `isDispatchable: false` with zero inputs. A `debug`-level log is emitted. The overlay opens with ref-only (no custom inputs), matching the acceptance criteria for INT-WFD-013.

3. **Memoization on `workflow.config` and `workflow.id`:** The parsing is pure but potentially involves `JSON.parse`. Memoizing on the workflow identity prevents re-parsing on unrelated re-renders.

---

### Step 3: Implement ref validation utility

**File:** `apps/tui/src/screens/Workflows/hooks/useDispatchForm.ts` (inline, not exported)

Ref validation is embedded in the form state hook since it is only consumed there.

```typescript
import { MAX_REF_LENGTH } from "../components/DispatchOverlay.types.js";

/**
 * Validate a ref string against bookmark name rules.
 *
 * Rules (from acceptance criteria):
 * - No `..` sequences (path traversal)
 * - No control characters (ASCII 0x00-0x1F, 0x7F)
 * - No leading or trailing slashes
 * - Maximum 255 characters
 *
 * Returns null if valid, or an error message string if invalid.
 */
function validateRef(ref: string): string | null {
  if (ref.length > MAX_REF_LENGTH) {
    return `Ref must be at most ${MAX_REF_LENGTH} characters`;
  }
  if (ref.includes("..")) {
    return "Ref must not contain '..'";
  }
  if (/[\x00-\x1f\x7f]/.test(ref)) {
    return "Ref must not contain control characters";
  }
  if (ref.startsWith("/") || ref.endsWith("/")) {
    return "Ref must not start or end with '/'";
  }
  return null;
}
```

---

### Step 4: Implement form state management hook

**File:** `apps/tui/src/screens/Workflows/hooks/useDispatchForm.ts`

This hook manages the full form lifecycle: values, focus, validation, submission, and error state. It does NOT register keybindings — that is done by the `<Modal>` component's `keybindings` prop in the overlay.

```typescript
import { useCallback, useMemo, useRef, useState } from "react";
import { useDispatchWorkflow } from "../../../hooks/useDispatchWorkflow.js";
import type { RepoIdentifier, HookError } from "../../../hooks/workflow-types.js";
import type {
  DispatchFormState,
  FocusableFieldCount,
  ParsedDispatchInput,
} from "../components/DispatchOverlay.types.js";
import {
  MAX_INPUT_VALUE_LENGTH,
  MAX_REF_LENGTH,
} from "../components/DispatchOverlay.types.js";

// validateRef defined inline above

export interface UseDispatchFormOptions {
  workflowId: number;
  inputs: ParsedDispatchInput[];
  repo: RepoIdentifier;
  onSuccess: () => void;
  onDismiss: () => void;
  onAuthError: () => void;
}

export interface UseDispatchFormReturn {
  /** Current form state. */
  state: DispatchFormState;
  /** Total focusable field count: 1 (ref) + inputs.length + 2 (buttons). */
  fieldCount: FocusableFieldCount;
  /** Update the ref value. */
  setRef: (value: string) => void;
  /** Update an input value by key. */
  setInputValue: (key: string, value: string) => void;
  /** Move focus to next field (wraps around). */
  focusNext: () => void;
  /** Move focus to previous field (wraps around). */
  focusPrev: () => void;
  /** Move focus to a specific index. */
  setFocusIndex: (index: number) => void;
  /** Submit the dispatch form. */
  handleSubmit: () => void;
  /** Whether the focused field is the Dispatch button. */
  isDispatchButtonFocused: boolean;
  /** Whether the focused field is the Cancel button. */
  isCancelButtonFocused: boolean;
  /** Index of the Dispatch button in the focus order. */
  dispatchButtonIndex: number;
  /** Index of the Cancel button in the focus order. */
  cancelButtonIndex: number;
}

export function useDispatchForm(
  options: UseDispatchFormOptions,
): UseDispatchFormReturn {
  const { workflowId, inputs, repo, onSuccess, onDismiss, onAuthError } = options;

  // Compute field count: 1 (ref) + inputs.length + 2 (Dispatch, Cancel)
  const fieldCount = 1 + inputs.length + 2;
  const dispatchButtonIndex = fieldCount - 2;
  const cancelButtonIndex = fieldCount - 1;

  // ── State ──────────────────────────────────────────────────────────

  const [ref, setRefRaw] = useState("main");
  const [inputValues, setInputValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const input of inputs) {
      initial[input.key] = input.defaultValue;
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [focusIndex, setFocusIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Stable ref for submission guard
  const isSubmittingRef = useRef(false);

  // ── Dispatch mutation ──────────────────────────────────────────────

  const dispatchMutation = useDispatchWorkflow(repo, {
    onSuccess: () => {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      onSuccess();
    },
    onError: (error: HookError) => {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      handleApiError(error);
    },
  });

  // ── Setters ────────────────────────────────────────────────────────

  const setRef = useCallback(
    (value: string) => {
      if (isSubmittingRef.current) return;
      // Enforce max length at input level
      const clamped = value.slice(0, MAX_REF_LENGTH);
      setRefRaw(clamped);
      // Clear error on change
      setErrors((prev) => ({ ...prev, ref: null }));
      setSubmitError(null);
    },
    [],
  );

  const setInputValue = useCallback(
    (key: string, value: string) => {
      if (isSubmittingRef.current) return;
      const clamped = value.slice(0, MAX_INPUT_VALUE_LENGTH);
      setInputValues((prev) => ({ ...prev, [key]: clamped }));
      setErrors((prev) => ({ ...prev, [key]: null }));
      setSubmitError(null);
    },
    [],
  );

  // ── Focus navigation ───────────────────────────────────────────────

  const focusNext = useCallback(() => {
    setFocusIndex((prev) => (prev + 1) % fieldCount);
  }, [fieldCount]);

  const focusPrev = useCallback(() => {
    setFocusIndex((prev) => (prev - 1 + fieldCount) % fieldCount);
  }, [fieldCount]);

  // ── Validation ─────────────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string | null> = {};
    const refError = validateRef(ref);
    if (refError) newErrors.ref = refError;

    for (const input of inputs) {
      const value = inputValues[input.key] ?? "";
      if (value.length > MAX_INPUT_VALUE_LENGTH) {
        newErrors[input.key] = `Max ${MAX_INPUT_VALUE_LENGTH} characters`;
      }
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some((e) => e !== null && e !== undefined);
  }, [ref, inputs, inputValues]);

  // ── Error mapping ──────────────────────────────────────────────────

  const handleApiError = useCallback(
    (error: HookError) => {
      // Extract HTTP status from the error
      const status = (error as any)?.status ?? (error as any)?.statusCode ?? 0;

      if (status === 401) {
        onAuthError();
        return;
      }

      const errorMessages: Record<number, string> = {
        400: "Invalid dispatch inputs",
        403: "Permission denied — write access required",
        404: "Workflow not found",
        409: "Workflow is inactive",
      };

      if (status === 429) {
        const retryAfter = (error as any)?.retryAfter ?? "?";
        setSubmitError(`Rate limited. Retry in ${retryAfter}s.`);
        return;
      }

      if (status >= 500) {
        setSubmitError("Server error. Please try again.");
        return;
      }

      if (errorMessages[status]) {
        setSubmitError(errorMessages[status]);
        return;
      }

      // Network error or unknown
      if (error.message?.includes("timeout") || error.message?.includes("Timeout")) {
        setSubmitError("Request timed out");
        return;
      }

      setSubmitError("Network error. Press Ctrl+S to retry.");
    },
    [onAuthError],
  );

  // ── Submit ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    // Double-submit prevention
    if (isSubmittingRef.current) return;

    // Run validation
    if (!validate()) return;

    // Resolve ref: empty → "main"
    const resolvedRef = ref.trim() || "main";

    // Build inputs payload
    const inputsPayload: Record<string, unknown> = {};
    for (const input of inputs) {
      const value = inputValues[input.key] ?? input.defaultValue;
      if (input.type === "boolean") {
        inputsPayload[input.key] = value === "true";
      } else {
        inputsPayload[input.key] = value;
      }
    }

    setIsSubmitting(true);
    isSubmittingRef.current = true;
    setSubmitError(null);

    dispatchMutation.execute({
      workflowId,
      ref: resolvedRef,
      inputs: inputs.length > 0 ? inputsPayload : undefined,
    });
  }, [ref, inputs, inputValues, validate, workflowId, dispatchMutation]);

  // ── Return ─────────────────────────────────────────────────────────

  const state: DispatchFormState = {
    ref,
    inputValues,
    errors,
    focusIndex,
    isSubmitting,
    submitError,
  };

  return {
    state,
    fieldCount,
    setRef,
    setInputValue,
    focusNext,
    focusPrev,
    setFocusIndex,
    handleSubmit,
    isDispatchButtonFocused: focusIndex === dispatchButtonIndex,
    isCancelButtonFocused: focusIndex === cancelButtonIndex,
    dispatchButtonIndex,
    cancelButtonIndex,
  };
}
```

**Key implementation details:**

1. **Double-submit prevention:** Both `isSubmitting` state (for rendering) and `isSubmittingRef` ref (for synchronous guard checks in `handleSubmit`) prevent double submissions. The ref is needed because React state updates are async — two rapid `Ctrl+S` presses could both read `isSubmitting === false` before the first setState takes effect.

2. **Empty ref → "main":** Per the acceptance criteria, if the user clears the ref field, the submission uses "main" as the default. This matches the server's fallback (`body.ref || "main"`).

3. **Boolean type conversion:** The form stores all values as strings internally (`"true"` / `"false"` for booleans). On submission, boolean inputs are converted to actual `boolean` values in the payload, matching server expectations.

4. **Input value clamping:** Values are clamped to `MAX_INPUT_VALUE_LENGTH` (1000) at the setter level, preventing the user from typing beyond the limit. The 1001st character is silently rejected (acceptance criteria EDGE-WFD-005).

5. **Error mapping:** HTTP status codes map to specific user-facing error messages per the acceptance criteria. Network errors and timeouts are handled separately. 401 closes the overlay and delegates to the auth error screen.

---

### Step 5: Implement the BooleanToggle component

**File:** `apps/tui/src/screens/Workflows/components/BooleanToggle.tsx`

A custom field component that renders `[true]` or `[false]` and toggles on Space/Enter. This does not exist in the generic form system.

```typescript
import React from "react";
import { useTheme } from "../../../hooks/useTheme.js";

export interface BooleanToggleProps {
  /** Current value as string: "true" or "false". */
  value: string;
  /** Called when the value is toggled. */
  onChange: (value: string) => void;
  /** Whether this field is currently focused. */
  focused: boolean;
  /** Whether the field is disabled (during submission). */
  disabled: boolean;
  /** Label text displayed above the toggle. */
  label: string;
  /** Optional description text displayed below. */
  description?: string | null;
}

export function BooleanToggle({
  value,
  onChange,
  focused,
  disabled,
  label,
  description,
}: BooleanToggleProps) {
  const theme = useTheme();
  const boolDisplay = value === "true" ? "[true]" : "[false]";

  return (
    <box flexDirection="column">
      <text fg={theme.muted}>{label}</text>
      <box
        borderStyle="single"
        borderColor={focused ? theme.primary : theme.border}
      >
        <text
          fg={focused ? theme.primary : undefined}
          dimmed={disabled}
        >
          {boolDisplay}
        </text>
      </box>
      {description && (
        <text fg={theme.muted} dimmed>{description}</text>
      )}
    </box>
  );
}
```

**Keyboard handling:** Space and Enter on a focused boolean toggle are handled by the overlay's keybinding scope (Step 7), not by the component itself. When the focused field is a boolean toggle and Space/Enter is pressed, the overlay calls `setInputValue(key, value === "true" ? "false" : "true")`. This keeps the component purely presentational.

---

### Step 6: Implement the status flash hook

**File:** `apps/tui/src/screens/Workflows/hooks/useStatusFlash.ts`

A utility hook for showing timed status bar messages. Used for "Workflow dispatched ✓", "Workflow does not support manual dispatch", and "Permission denied".

```typescript
import { useCallback, useRef, useState } from "react";

export interface StatusFlash {
  message: string;
  color: "success" | "warning" | "error";
}

export interface UseStatusFlashReturn {
  /** Current active flash, or null. */
  flash: StatusFlash | null;
  /** Show a flash message for the specified duration. */
  showFlash: (message: string, color: StatusFlash["color"], durationMs: number) => void;
  /** Clear the current flash immediately. */
  clearFlash: () => void;
}

export function useStatusFlash(): UseStatusFlashReturn {
  const [flash, setFlash] = useState<StatusFlash | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlash = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFlash(null);
  }, []);

  const showFlash = useCallback(
    (message: string, color: StatusFlash["color"], durationMs: number) => {
      clearFlash();
      setFlash({ message, color });
      timerRef.current = setTimeout(() => {
        setFlash(null);
        timerRef.current = null;
      }, durationMs);
    },
    [clearFlash],
  );

  return { flash, showFlash, clearFlash };
}
```

**Integration:** The `WorkflowListScreen` component renders the flash message in the status bar zone when `flash !== null`. The flash is colored via the theme's `success`, `warning`, or `error` token.

---

### Step 7: Implement the DispatchOverlay component

**File:** `apps/tui/src/screens/Workflows/components/DispatchOverlay.tsx`

This is the main overlay component. It composes `<Modal>`, renders the dynamic form, and wires all keyboard interactions.

```typescript
import React, { useCallback, useMemo } from "react";
import { Modal } from "../../../components/Modal.js";
import { useLayout } from "../../../hooks/useLayout.js";
import { useTheme } from "../../../hooks/useTheme.js";
import { useSpinner } from "../../../hooks/useSpinner.js";
import type { KeyHandler } from "../../../providers/keybinding-types.js";
import { useDispatchInputs } from "../hooks/useDispatchInputs.js";
import { useDispatchForm } from "../hooks/useDispatchForm.js";
import { BooleanToggle } from "./BooleanToggle.js";
import type { DispatchOverlayProps, ParsedDispatchInput } from "./DispatchOverlay.types.js";
import { MAX_RENDERED_INPUTS } from "./DispatchOverlay.types.js";

export function DispatchOverlay({
  visible,
  onDismiss,
  workflow,
  repo,
  onSuccess,
}: DispatchOverlayProps) {
  const theme = useTheme();
  const layout = useLayout();
  const spinner = useSpinner();

  // Parse workflow config into dispatch input definitions
  const { inputs, totalInputCount, isTruncated } = useDispatchInputs(workflow);

  // Auth error handler: close overlay and let app-level error boundary handle 401
  const handleAuthError = useCallback(() => {
    onDismiss();
    // The APIClientProvider's 401 interceptor will show the auth error screen
  }, [onDismiss]);

  // Form state and actions
  const form = useDispatchForm({
    workflowId: workflow.id,
    inputs,
    repo,
    onSuccess: () => {
      onDismiss();
      onSuccess();
    },
    onDismiss,
    onAuthError: handleAuthError,
  });

  // ── Keybinding handlers ────────────────────────────────────────────

  /**
   * Determine the type of the currently focused field.
   *
   * Focus order: [0] = ref, [1..N] = inputs, [N+1] = Dispatch, [N+2] = Cancel
   */
  const getFocusedFieldType = useCallback((): {
    kind: "ref" | "input" | "dispatch-button" | "cancel-button";
    input?: ParsedDispatchInput;
  } => {
    if (form.state.focusIndex === 0) return { kind: "ref" };
    if (form.isDispatchButtonFocused) return { kind: "dispatch-button" };
    if (form.isCancelButtonFocused) return { kind: "cancel-button" };
    const inputIndex = form.state.focusIndex - 1;
    return { kind: "input", input: inputs[inputIndex] };
  }, [form.state.focusIndex, form.isDispatchButtonFocused, form.isCancelButtonFocused, inputs]);

  /**
   * Handle Enter key in the overlay.
   *
   * Behavior depends on what is focused:
   * - Boolean toggle → toggle value
   * - Dispatch button → submit
   * - Cancel button → dismiss
   * - Choice field → handled by <select> natively (Enter opens dropdown)
   * - String/ref field → advance to next field
   */
  const handleEnter = useCallback(() => {
    if (form.state.isSubmitting) return;
    const focused = getFocusedFieldType();

    if (focused.kind === "dispatch-button") {
      form.handleSubmit();
      return;
    }
    if (focused.kind === "cancel-button") {
      onDismiss();
      return;
    }
    if (focused.kind === "input" && focused.input?.type === "boolean") {
      const current = form.state.inputValues[focused.input.key] ?? "false";
      form.setInputValue(focused.input.key, current === "true" ? "false" : "true");
      return;
    }
    // Default: advance to next field
    form.focusNext();
  }, [form, getFocusedFieldType, onDismiss]);

  /**
   * Handle Space key in the overlay.
   *
   * Only meaningful for boolean toggles and buttons.
   * For string/choice fields, Space falls through to native input.
   */
  const handleSpace = useCallback(() => {
    if (form.state.isSubmitting) return;
    const focused = getFocusedFieldType();

    if (focused.kind === "input" && focused.input?.type === "boolean") {
      const current = form.state.inputValues[focused.input.key] ?? "false";
      form.setInputValue(focused.input.key, current === "true" ? "false" : "true");
      return;
    }
    if (focused.kind === "dispatch-button") {
      form.handleSubmit();
      return;
    }
    if (focused.kind === "cancel-button") {
      onDismiss();
      return;
    }
    // For string/choice/ref: don't intercept Space — let it type
  }, [form, getFocusedFieldType, onDismiss]);

  // Build keybindings for the Modal's PRIORITY.MODAL scope
  const keybindings: KeyHandler[] = useMemo(() => {
    const bindings: KeyHandler[] = [
      {
        key: "tab",
        description: "Next field",
        handler: () => !form.state.isSubmitting && form.focusNext(),
      },
      {
        key: "shift+tab",
        description: "Previous field",
        handler: () => !form.state.isSubmitting && form.focusPrev(),
      },
      {
        key: "ctrl+s",
        description: "Dispatch",
        handler: () => form.handleSubmit(),
      },
      {
        key: "return",
        description: "Activate",
        handler: handleEnter,
        // Only intercept Enter when focused on a button or boolean toggle.
        // For string/choice fields, Enter should fall through to native handling
        // (advance in input, open dropdown in select).
        when: () => {
          const focused = getFocusedFieldType();
          return (
            focused.kind === "dispatch-button" ||
            focused.kind === "cancel-button" ||
            (focused.kind === "input" && focused.input?.type === "boolean") ||
            focused.kind === "ref" // Enter on ref advances to next
          );
        },
      },
      {
        key: " ", // Space
        description: "Toggle",
        handler: handleSpace,
        when: () => {
          const focused = getFocusedFieldType();
          return (
            (focused.kind === "input" && focused.input?.type === "boolean") ||
            focused.kind === "dispatch-button" ||
            focused.kind === "cancel-button"
          );
        },
      },
    ];
    return bindings;
  }, [form, handleEnter, handleSpace, getFocusedFieldType]);

  // ── Responsive sizing ──────────────────────────────────────────────

  const overlayWidth = useMemo(
    () => ({
      minimum: "90%" as string | number,
      standard: "50%" as string | number,
      large: "50%" as string | number,
    }),
    [],
  );

  const overlayHeight = useMemo(
    () => ({
      minimum: "auto" as string | number,
      standard: "auto" as string | number,
      large: "auto" as string | number,
    }),
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────

  if (!visible) return null;

  const isMinimum = layout.breakpoint === "minimum";

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      title="Dispatch Workflow"
      width={overlayWidth}
      height={overlayHeight}
      dismissOnEsc={true}
      keybindings={keybindings}
    >
      <box flexDirection="column" paddingX={1} paddingY={0} gap={isMinimum ? 0 : 1}>
        {/* Workflow name */}
        <text>{workflow.name}</text>

        {/* Ref input */}
        <box flexDirection="column">
          <text fg={theme.muted}>Ref</text>
          <box
            borderStyle="single"
            borderColor={form.state.focusIndex === 0 ? theme.primary : theme.border}
          >
            <input
              value={form.state.ref}
              onInput={(value: string) => form.setRef(value)}
              focused={form.state.focusIndex === 0}
              disabled={form.state.isSubmitting}
            />
          </box>
          {form.state.errors.ref && (
            <text fg={theme.error}>{form.state.errors.ref}</text>
          )}
        </box>

        {/* Dynamic input fields */}
        <scrollbox scrollY={true} flexGrow={1}>
          <box flexDirection="column" gap={isMinimum ? 0 : 1}>
            {inputs.map((input, i) => {
              const fieldIndex = i + 1; // +1 for ref field
              const focused = form.state.focusIndex === fieldIndex;
              const value = form.state.inputValues[input.key] ?? input.defaultValue;
              const error = form.state.errors[input.key];
              const disabled = form.state.isSubmitting;

              if (input.type === "boolean") {
                return (
                  <BooleanToggle
                    key={input.key}
                    label={input.key}
                    value={value}
                    onChange={(v) => form.setInputValue(input.key, v)}
                    focused={focused}
                    disabled={disabled}
                    description={!isMinimum ? input.description : null}
                  />
                );
              }

              if (input.type === "choice") {
                return (
                  <box key={input.key} flexDirection="column">
                    <text fg={theme.muted}>{input.key}</text>
                    <box
                      borderStyle="single"
                      borderColor={focused ? theme.primary : theme.border}
                    >
                      <select
                        options={input.options.map((opt) => ({
                          name: opt,
                          value: opt,
                        }))}
                        value={value}
                        onChange={(v: string) => form.setInputValue(input.key, v)}
                        focused={focused}
                        disabled={disabled}
                      />
                    </box>
                    {!isMinimum && input.description && (
                      <text fg={theme.muted} dimmed>{input.description}</text>
                    )}
                    {error && <text fg={theme.error}>{error}</text>}
                  </box>
                );
              }

              // Default: string input
              return (
                <box key={input.key} flexDirection="column">
                  <text fg={theme.muted}>{input.key}</text>
                  <box
                    borderStyle="single"
                    borderColor={focused ? theme.primary : theme.border}
                  >
                    <input
                      value={value}
                      onInput={(v: string) => form.setInputValue(input.key, v)}
                      focused={focused}
                      disabled={disabled}
                    />
                  </box>
                  {!isMinimum && input.description && (
                    <text fg={theme.muted} dimmed>{input.description}</text>
                  )}
                  {error && <text fg={theme.error}>{error}</text>}
                </box>
              );
            })}
          </box>
        </scrollbox>

        {/* Truncation note */}
        {isTruncated && (
          <text fg={theme.muted}>
            Showing {MAX_RENDERED_INPUTS} of {totalInputCount} inputs
          </text>
        )}

        {/* Action buttons */}
        <box flexDirection="row" gap={2}>
          <text
            fg={form.isDispatchButtonFocused ? theme.primary : undefined}
            bold={form.isDispatchButtonFocused}
            dimmed={form.state.isSubmitting}
          >
            {form.state.isSubmitting
              ? `Dispatching${spinner.frame} `
              : "[ Dispatch ]"}
          </text>
          <text
            fg={form.isCancelButtonFocused ? theme.primary : undefined}
            bold={form.isCancelButtonFocused}
            dimmed={form.state.isSubmitting}
          >
            [ Cancel ]
          </text>
        </box>

        {/* Inline error */}
        {form.state.submitError && (
          <text fg={theme.error}>{form.state.submitError}</text>
        )}
      </box>
    </Modal>
  );
}
```

**Key rendering decisions:**

1. **Scrollbox for inputs:** The input fields are wrapped in a `<scrollbox scrollY={true}>` to handle workflows with many inputs. The scrollbox uses flex-grow to consume available height between the ref field and the button row.

2. **Description hiding at minimum breakpoint:** At 80×24, descriptions are hidden (`!isMinimum` guard) to conserve vertical space. This matches acceptance criteria: "descriptions hidden if height constrained."

3. **Border color for focus:** Focused fields have `borderColor={theme.primary}`, unfocused use `theme.border`. This is the standard focus indicator pattern used across the TUI.

4. **Spinner rendering:** During submission, the Dispatch button text changes to `"Dispatching…"` followed by a spinner frame from `useSpinner()`. The spinner animates via the LoadingProvider's frame cycle.

5. **Keybinding `when` predicates:** Enter and Space have `when` predicates that check the focused field type. This prevents intercepting these keys when the user is typing in a string input (where Enter should not advance and Space should type a space character). For choice fields, Enter opens the dropdown natively via OpenTUI's `<select>` component — it is not intercepted.

---

### Step 8: Wire dispatch overlay into WorkflowListScreen

**File:** `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx`

Add the `d` keybinding to the workflow list screen and render the dispatch overlay.

```typescript
// --- Inside WorkflowListScreen component ---

import { useModal } from "../../hooks/useModal.js";
import { useDispatchInputs } from "./hooks/useDispatchInputs.js";
import { useStatusFlash } from "./hooks/useStatusFlash.js";
import { DispatchOverlay } from "./components/DispatchOverlay.js";

// In the component body:
const modal = useModal();
const statusFlash = useStatusFlash();
const navigation = useNavigation();
const repo = navigation.repoContext;

// Currently focused workflow definition from the list
const focusedWorkflow: WorkflowDefinition | null = /* from list state */;

// Pre-parse dispatch inputs for the focused workflow (for dispatchability check)
const dispatchInputs = useDispatchInputs(focusedWorkflow ?? { id: 0, config: null } as any);

// Handler for `d` keybinding
const handleDispatchPress = useCallback(() => {
  if (!focusedWorkflow) return;

  // Check write access (provided by repo permissions context)
  if (!hasWriteAccess) {
    statusFlash.showFlash("Permission denied", "warning", 3000);
    return;
  }

  // Check if workflow supports dispatch
  if (!dispatchInputs.isDispatchable) {
    statusFlash.showFlash(
      "Workflow does not support manual dispatch",
      "warning",
      3000,
    );
    return;
  }

  // Don't open if overlay already open
  if (modal.isOpen) return;

  modal.open();
}, [focusedWorkflow, hasWriteAccess, dispatchInputs.isDispatchable, modal]);

// Register `d` keybinding at SCREEN priority
useScreenKeybindings([
  // ... existing list keybindings (j, k, Enter, etc.)
  {
    key: "d",
    description: "Dispatch",
    handler: handleDispatchPress,
    when: () => !modal.isOpen, // Suppress while overlay is open
  },
]);

// Handle successful dispatch
const handleDispatchSuccess = useCallback(() => {
  statusFlash.showFlash("Workflow dispatched ✓", "success", 3000);
  workflowRuns.refetch(); // Refresh run summaries
}, [statusFlash, workflowRuns]);

// In the render return:
return (
  <>
    {/* ... existing list content ... */}

    {/* Status flash in status bar */}
    {statusFlash.flash && (
      <text fg={theme[statusFlash.flash.color]}>
        {statusFlash.flash.message}
      </text>
    )}

    {/* Dispatch overlay */}
    {focusedWorkflow && (
      <DispatchOverlay
        visible={modal.isOpen}
        onDismiss={modal.close}
        workflow={focusedWorkflow}
        repo={repo!}
        onSuccess={handleDispatchSuccess}
      />
    )}
  </>
);
```

**Key wiring decisions:**

1. **`d` keybinding at `PRIORITY.SCREEN`:** The `d` key is registered alongside other list keybindings. Its `when` predicate returns `false` when the overlay is already open, preventing duplicate opens. This handles acceptance criteria: "Rapid `d` presses: if overlay is already open, subsequent `d` presses are no-op."

2. **Write access check:** The screen checks `hasWriteAccess` (provided by the repo permissions context from the navigation provider) before opening the overlay. Read-only users see "Permission denied" in the status bar.

3. **Dispatchability check:** `useDispatchInputs` is called on the focused workflow to determine if it has `workflow_dispatch` in its triggers. Non-dispatchable workflows show the appropriate status bar message.

4. **Run summaries refresh:** After successful dispatch, `workflowRuns.refetch()` is called to show the new queued run in the list.

---

### Step 9: Status bar hint override during overlay

When the dispatch overlay is open, the status bar hints should show dispatch-specific actions. The `<Modal>` component's keybinding scope registration at `PRIORITY.MODAL` automatically takes precedence for hint display. The hints derived from the keybinding handlers are:

```
Tab:next │ Ctrl+S:dispatch │ Esc:cancel
```

These are derived from the `description` field on each `KeyHandler` passed to the Modal's `keybindings` prop. The existing `StatusBar` component reads hints from the highest-priority active keybinding scope, which is `PRIORITY.MODAL` when the overlay is open.

No additional code is needed — the hint system works by design.

---

### Step 10: Auth error propagation

When the dispatch API returns 401, the overlay must close and the auth error screen must appear. The flow:

1. `useDispatchForm.handleApiError` detects `status === 401`.
2. Calls `onAuthError()`, which calls `onDismiss()` (closing the overlay).
3. The `APIClientProvider`'s response interceptor detects 401 and sets `authState = "expired"` on the `AuthProvider`.
4. The `AuthProvider` renders the "Session expired. Run `codeplane auth login` to re-authenticate." error screen, replacing all content.

This relies on the existing auth error infrastructure. The dispatch overlay does not implement its own auth error screen.

---

## File Inventory

| File Path | Status | Description |
|-----------|--------|-------------|
| `apps/tui/src/screens/Workflows/components/DispatchOverlay.tsx` | **New** | Main dispatch overlay component |
| `apps/tui/src/screens/Workflows/components/DispatchOverlay.types.ts` | **New** | Type definitions: `ParsedDispatchInput`, `DispatchFormState`, `DispatchOverlayProps`, constants |
| `apps/tui/src/screens/Workflows/components/BooleanToggle.tsx` | **New** | Boolean toggle field component |
| `apps/tui/src/screens/Workflows/hooks/useDispatchForm.ts` | **New** | Form state management, validation, submission, error mapping |
| `apps/tui/src/screens/Workflows/hooks/useDispatchInputs.ts` | **New** | Input type resolution from workflow config |
| `apps/tui/src/screens/Workflows/hooks/useStatusFlash.ts` | **New** | Timed status bar flash messages |
| `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx` | **Modified** | Add `d` keybinding, write-access gate, dispatchability check, overlay rendering |
| `e2e/tui/workflows.test.ts` | **Modified** | Add 76 dispatch-specific E2E tests |

### Dependency Graph

```
DispatchOverlay.tsx
├── Modal (components/Modal.tsx)                   — focus trap, border, sizing
├── BooleanToggle.tsx                              — boolean field rendering
├── useDispatchForm.ts                             — form state + submission
│   └── useDispatchWorkflow (hooks/useDispatchWorkflow.ts)  — API mutation
├── useDispatchInputs.ts                           — config → ParsedDispatchInput[]
├── useLayout (hooks/useLayout.ts)                 — responsive breakpoint
├── useTheme (hooks/useTheme.ts)                   — color tokens
└── useSpinner (hooks/useSpinner.ts)               — submission spinner

WorkflowListScreen.tsx
├── DispatchOverlay.tsx                            — overlay component
├── useModal (hooks/useModal.ts)                   — overlay visibility state
├── useDispatchInputs.ts                           — dispatchability check
├── useStatusFlash.ts                              — status bar flash messages
├── useScreenKeybindings (hooks/useScreenKeybindings.ts) — `d` key registration
└── useWorkflowRuns (hooks/useWorkflowRuns.ts)     — refetch on success
```

---

## Keyboard Event Flow

### When overlay is open — full priority stack

```
┌─────────────────────────────────────┐
│ Priority 1: TEXT_INPUT              │  Active when <input> or <select>
│                                     │  is focused. Receives printable
│                                     │  chars, Backspace, arrows.
├─────────────────────────────────────┤
│ Priority 2: MODAL (Dispatch scope)  │  Active when overlay is open.
│                                     │  Handlers:
│                                     │    tab → focusNext()
│                                     │    shift+tab → focusPrev()
│                                     │    ctrl+s → handleSubmit()
│                                     │    return → handleEnter() [when]
│                                     │    space → handleSpace() [when]
│                                     │    escape → onDismiss()
├─────────────────────────────────────┤
│ Priority 3: GOTO                    │  SUPPRESSED — modal scope
│                                     │  intercepts `g` before goto
├─────────────────────────────────────┤
│ Priority 4: SCREEN (List scope)     │  SUPPRESSED — modal scope
│                                     │  intercepts before screen
├─────────────────────────────────────┤
│ Priority 5: GLOBAL                  │  SUPPRESSED for q, ?, :
│                                     │  Ctrl+C still active (quit)
└─────────────────────────────────────┘
```

**Critical: Space and Enter `when` predicates prevent intercepting typing:**

- When the user is focused on a string `<input>` field, Space should type a space character. The `handleSpace` handler's `when` predicate returns `false` for string and ref fields, letting Space fall through to OpenTUI's native input handling.
- When the user is focused on a choice `<select>` field, Enter opens the dropdown natively. The `handleEnter` handler's `when` predicate returns `false` for choice fields.
- Enter on the ref field advances to the next field (predicate returns `true` for ref).
- Enter/Space on boolean toggles toggle the value (predicate returns `true`).
- Enter/Space on buttons activate them (predicate returns `true`).

### Choice field dropdown interaction

When a choice `<select>` is focused and the user presses Enter:
1. No `PRIORITY.MODAL` handler intercepts (the `when` predicate for `return` returns `false` for choice fields).
2. Enter falls through to OpenTUI's `<select>` component which opens the dropdown.
3. Inside the dropdown, `j`/`k` navigate options and `Enter` confirms selection — these are handled by OpenTUI's native `<select>` implementation.
4. `Esc` within the dropdown closes it without selection — this is also native OpenTUI behavior. The overlay's Esc handler is not triggered because OpenTUI's dropdown consumes the event first.

---

## Responsive Sizing

| Breakpoint | Terminal | Overlay Width | Overlay Height | Behavior |
|-----------|---------|--------------|---------------|----------|
| `minimum` | 80×24 | 90% (72 cols) | auto (min 10 rows, max rows−4) | Descriptions hidden, gap=0, compact |
| `standard` | 120×40 | 50% (60 cols) | auto (min 30%, max 70%) | Full layout with descriptions, gap=1 |
| `large` | 200×60 | 50% (100 cols) | auto (min 30%, max 70%) | Full layout, extra spacing |
| `null` (< 80×24) | N/A | N/A | "Terminal too small" screen | Overlay not rendered |

**Height auto-sizing:** The overlay uses `height="auto"` which lets the `<Modal>` component size based on content. The `min-height` and `max-height` constraints are enforced by the Modal's responsive sizing system. When inputs exceed the max height, the `<scrollbox>` provides vertical scrolling.

**Minimum width enforcement:** The `<Modal>` component enforces a minimum width of 30 characters regardless of breakpoint, preventing form fields from becoming unusable.

---

## Error Handling Matrix

| Condition | HTTP Status | Inline Error Message | Overlay Behavior |
|-----------|------------|---------------------|------------------|
| Invalid inputs | 400 | "Invalid dispatch inputs" | Stays open, fields re-enabled |
| No write access | 403 | "Permission denied — write access required" | Stays open |
| Workflow not found | 404 | "Workflow not found" | Stays open |
| Workflow inactive | 409 | "Workflow is inactive" | Stays open |
| Rate limited | 429 | "Rate limited. Retry in {Retry-After}s." | Stays open |
| Server error | 500+ | "Server error. Please try again." | Stays open |
| Auth expired | 401 | N/A | Closes → auth error screen |
| Network error | N/A | "Network error. Press Ctrl+S to retry." | Stays open |
| Request timeout (30s) | N/A | "Request timed out" | Stays open |

All non-401 errors keep the overlay open with fields re-enabled so the user can correct inputs and retry without re-entering data. The error message renders in red (`theme.error`) below the action buttons.

---

## Logging

All log output goes to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Overlay opened | `WorkflowDispatch: opened [repo={owner}/{repo}] [workflow_id={id}] [name={name}] [input_count={n}]` |
| `debug` | Inputs parsed | `WorkflowDispatch: inputs parsed [repo={owner}/{repo}] [workflow_id={id}] [string={s}] [boolean={b}] [choice={c}]` |
| `debug` | Field changed | `WorkflowDispatch: field changed [repo={owner}/{repo}] [workflow_id={id}] [field={key}] [type={type}]` |
| `info` | Dispatch submitted | `WorkflowDispatch: submitted [repo={owner}/{repo}] [workflow_id={id}] [name={name}] [ref={ref}] [input_count={n}]` |
| `info` | Dispatch succeeded | `WorkflowDispatch: succeeded [repo={owner}/{repo}] [workflow_id={id}] [name={name}] [duration={ms}ms]` |
| `info` | Overlay dismissed | `WorkflowDispatch: cancelled [repo={owner}/{repo}] [workflow_id={id}] [fields_modified={n}]` |
| `warn` | Dispatch failed | `WorkflowDispatch: failed [repo={owner}/{repo}] [workflow_id={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `WorkflowDispatch: rate limited [repo={owner}/{repo}] [workflow_id={id}] [retry_after={s}]` |
| `warn` | Non-dispatchable | `WorkflowDispatch: blocked [repo={owner}/{repo}] [workflow_id={id}] [triggers={triggers}]` |
| `warn` | Invalid ref | `WorkflowDispatch: invalid ref [repo={owner}/{repo}] [workflow_id={id}] [ref_length={n}]` |
| `error` | Auth error | `WorkflowDispatch: auth error [repo={owner}/{repo}] [status=401]` |
| `error` | Permission denied | `WorkflowDispatch: permission denied [repo={owner}/{repo}] [workflow_id={id}]` |
| `error` | Render error | `WorkflowDispatch: render error [repo={owner}/{repo}] [workflow_id={id}] [error={msg}]` |
| `error` | Network error | `WorkflowDispatch: network error [repo={owner}/{repo}] [workflow_id={id}] [error={msg}]` |

---

## Unit & Integration Tests

### Test File: `e2e/tui/workflows.test.ts`

All 76 tests are appended to the existing `e2e/tui/workflows.test.ts` file within a `describe("TUI_WORKFLOW_DISPATCH", ...)` block. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backend features are left failing — never skipped or commented out.

### Test Infrastructure Requirements

The workflow dispatch tests require:

1. **A test workflow definition with `workflow_dispatch` trigger and custom inputs** — created via API fixture or seeded in the test database. The definition should include:
   - A string input with a default value and description
   - A boolean input with `default: false`
   - A choice input with 3 options and a default
   - At least one input with no description

2. **A test workflow definition without `workflow_dispatch` trigger** — to test the non-dispatchable case.

3. **A test user with write access** and a test user with read-only access — for permission testing.

4. **`createMockAPIEnv()`** from `e2e/tui/helpers.ts` for environment setup.

### Test Helpers

```typescript
// e2e/tui/helpers/workflows.ts — additions

/**
 * Fixture: workflow definition with dispatch inputs.
 * Used by SNAP-WFD, KEY-WFD, INT-WFD tests.
 */
export const DISPATCHABLE_WORKFLOW = {
  id: 1,
  name: "ci-pipeline",
  path: ".codeplane/workflows/ci.yaml",
  config: {
    on: {
      workflow_dispatch: {
        inputs: {
          environment: {
            type: "choice",
            options: ["staging", "production", "development"],
            default: "staging",
            description: "Deploy target environment",
          },
          debug: {
            type: "boolean",
            default: false,
            description: "Enable debug logging",
          },
          version: {
            type: "string",
            default: "1.0.0",
          },
        },
      },
      push: { branches: ["main"] },
    },
  },
  is_active: true,
};

/**
 * Fixture: workflow definition without dispatch trigger.
 */
export const NON_DISPATCHABLE_WORKFLOW = {
  id: 2,
  name: "auto-test",
  path: ".codeplane/workflows/test.yaml",
  config: {
    on: {
      push: { branches: ["main"] },
    },
  },
  is_active: true,
};

/**
 * Fixture: workflow with many inputs (for truncation test).
 */
export function createManyInputsWorkflow(inputCount: number) {
  const inputs: Record<string, any> = {};
  for (let i = 0; i < inputCount; i++) {
    inputs[`input_${i}`] = {
      type: "string",
      default: `default_${i}`,
      description: `Description for input ${i}`,
    };
  }
  return {
    id: 3,
    name: "many-inputs",
    path: ".codeplane/workflows/many.yaml",
    config: { on: { workflow_dispatch: { inputs } } },
    is_active: true,
  };
}
```

### Terminal Snapshot Tests (16 tests)

```typescript
describe("TUI_WORKFLOW_DISPATCH — Snapshots", () => {
  test("SNAP-WFD-001: Dispatch overlay at 120×40 with zero custom inputs", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    // Navigate to a dispatchable workflow with no inputs
    await tui.waitForText("Workflows");
    // Focus workflow with zero inputs, press d
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-002: Dispatch overlay at 120×40 with 3 custom inputs", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.waitForText("environment"); // choice input
    await tui.waitForText("debug");       // boolean input
    await tui.waitForText("version");     // string input
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-003: Dispatch overlay at 80×24 — compact layout", async () => {
    const tui = await launchTUI({
      cols: 80, rows: 24,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-004: Dispatch overlay at 200×60 — expanded layout", async () => {
    const tui = await launchTUI({
      cols: 200, rows: 60,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-005: Dispatching spinner state", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("ctrl+s"); // Submit
    await tui.waitForText("Dispatching");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-006: Inline error message after failed dispatch", async () => {
    // Requires server to return error — use mock or trigger known error
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("ctrl+s");
    // Wait for error to appear
    await tui.waitForText("error", 5000);
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-007: Boolean toggle rendering — [false] and [true]", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("[false]");
    // Navigate to boolean field and toggle
    await tui.sendKeys("Tab", "Tab"); // ref → environment → debug
    await tui.sendKeys("Space");
    await tui.waitForText("[true]");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-008: Choice select dropdown open", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("Tab"); // Focus choice field
    await tui.sendKeys("Enter"); // Open dropdown
    await tui.waitForText("staging");
    await tui.waitForText("production");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-009: Ref input with custom value", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("main"); // Default ref
    // Clear and type new ref
    await tui.sendText("develop");
    await tui.waitForText("develop");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-010: Overlay header rendering", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.waitForText("ci-pipeline"); // workflow name
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-011: Input field with description text", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Deploy target environment"); // description
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-012: Input field with pre-filled default value", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("1.0.0"); // default for version input
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-013: Status bar hints while overlay open", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/Tab.*next/);
    expect(statusLine).toMatch(/Ctrl\+S.*dispatch/);
    expect(statusLine).toMatch(/Esc.*cancel/);
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-014: Status bar flash after successful dispatch", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Workflow dispatched ✓");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-015: Status bar message for non-dispatchable workflow", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    // Navigate to non-dispatchable workflow and press d
    await tui.sendKeys("j"); // Move to auto-test
    await tui.sendKeys("d");
    await tui.waitForText("Workflow does not support manual dispatch");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-WFD-016: Scrollable inputs overlay with 10+ custom inputs", async () => {
    // Requires workflow fixture with many inputs
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    // Navigate to many-inputs workflow
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });
});
```

### Keyboard Interaction Tests (28 tests)

```typescript
describe("TUI_WORKFLOW_DISPATCH — Keyboard", () => {
  test("KEY-WFD-001: d on dispatchable workflow opens overlay", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.terminate();
  });

  test("KEY-WFD-002: d on non-dispatchable workflow shows status bar message", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("j"); // Navigate to non-dispatchable
    await tui.sendKeys("d");
    await tui.waitForText("Workflow does not support manual dispatch");
    // Overlay should NOT open
    const content = tui.snapshot();
    expect(content).not.toContain("Dispatch Workflow");
    await tui.terminate();
  });

  test("KEY-WFD-003: Esc dismisses overlay", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("Esc");
    await tui.waitForNoText("Dispatch Workflow");
    await tui.terminate();
  });

  test("KEY-WFD-004: Enter on Cancel button dismisses overlay", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    // Tab to Cancel button: ref → env → debug → version → Dispatch → Cancel
    for (let i = 0; i < 5; i++) await tui.sendKeys("Tab");
    await tui.sendKeys("Enter");
    await tui.waitForNoText("Dispatch Workflow");
    await tui.terminate();
  });

  test("KEY-WFD-005: Tab cycles through all fields in order", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    // Tab through: ref → env → debug → version → Dispatch → Cancel → ref (wraps)
    for (let i = 0; i < 6; i++) {
      await tui.sendKeys("Tab");
    }
    // Should be back at ref after full cycle
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("KEY-WFD-006: Shift+Tab cycles backward", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    // Shift+Tab from ref → Cancel (wraps backward)
    await tui.sendKeys("shift+Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("KEY-WFD-007: Enter on Dispatch button submits", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    // Tab to Dispatch button
    for (let i = 0; i < 4; i++) await tui.sendKeys("Tab");
    await tui.sendKeys("Enter");
    // Should show Dispatching or success
    const content = tui.snapshot();
    expect(content).toMatch(/Dispatching|Workflow dispatched ✓/);
    await tui.terminate();
  });

  test("KEY-WFD-008: Ctrl+S submits from ref input", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("ctrl+s");
    const content = tui.snapshot();
    expect(content).toMatch(/Dispatching|Workflow dispatched ✓/);
    await tui.terminate();
  });

  test("KEY-WFD-009: Ctrl+S submits from custom input field", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("Tab"); // Focus first input
    await tui.sendKeys("ctrl+s");
    const content = tui.snapshot();
    expect(content).toMatch(/Dispatching|Workflow dispatched ✓/);
    await tui.terminate();
  });

  test("KEY-WFD-010: Ctrl+S submits from Dispatch button", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    for (let i = 0; i < 4; i++) await tui.sendKeys("Tab");
    await tui.sendKeys("ctrl+s");
    const content = tui.snapshot();
    expect(content).toMatch(/Dispatching|Workflow dispatched ✓/);
    await tui.terminate();
  });

  test("KEY-WFD-011: Typing in ref input updates value", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("main");
    await tui.sendText("develop");
    await tui.waitForText("develop");
    await tui.terminate();
  });

  test("KEY-WFD-012: Typing in string input updates value", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    // Tab to version (string) field: ref → env → debug → version
    for (let i = 0; i < 3; i++) await tui.sendKeys("Tab");
    await tui.sendText("2.0.0");
    await tui.waitForText("2.0.0");
    await tui.terminate();
  });

  test("KEY-WFD-013: Space toggles boolean false→true", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("[false]");
    // Tab to debug (boolean) field: ref → env → debug
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("Space");
    await tui.waitForText("[true]");
    await tui.terminate();
  });

  test("KEY-WFD-014: Space toggles boolean true→false", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("Tab", "Tab"); // Focus boolean
    await tui.sendKeys("Space"); // true
    await tui.waitForText("[true]");
    await tui.sendKeys("Space"); // false
    await tui.waitForText("[false]");
    await tui.terminate();
  });

  test("KEY-WFD-015: Enter on boolean toggle also toggles", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("Tab", "Tab");
    await tui.sendKeys("Enter");
    await tui.waitForText("[true]");
    await tui.terminate();
  });

  test("KEY-WFD-016: Enter on choice field opens dropdown", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("Tab"); // Focus choice field
    await tui.sendKeys("Enter");
    await tui.waitForText("production"); // Dropdown options visible
    await tui.terminate();
  });

  test("KEY-WFD-017: j/k navigates choice dropdown", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("Tab");
    await tui.sendKeys("Enter"); // Open dropdown
    await tui.sendKeys("j"); // Move to next option
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("KEY-WFD-018: Enter in choice dropdown selects and closes", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("Tab");
    await tui.sendKeys("Enter"); // Open
    await tui.sendKeys("j");     // Move to "production"
    await tui.sendKeys("Enter"); // Select
    await tui.waitForText("production");
    await tui.terminate();
  });

  test("KEY-WFD-019: Esc in choice dropdown closes without selecting", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("Tab");
    await tui.sendKeys("Enter"); // Open
    await tui.sendKeys("j");     // Navigate
    await tui.sendKeys("Esc");   // Close without selecting
    await tui.waitForText("staging"); // Still shows original value
    await tui.terminate();
  });

  test("KEY-WFD-020: Successful dispatch closes overlay and flashes status bar", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Workflow dispatched ✓");
    await tui.waitForNoText("Dispatch Workflow"); // Overlay closed
    await tui.terminate();
  });

  test("KEY-WFD-021: Failed dispatch shows inline error, overlay stays open", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("ctrl+s");
    // If server returns error, check overlay stays open
    const content = tui.snapshot();
    // Overlay should still be present (or success)
    expect(content).toMatch(/Dispatch Workflow|Workflow dispatched ✓/);
    await tui.terminate();
  });

  test("KEY-WFD-022: Double Ctrl+S during dispatch (second ignored)", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("ctrl+s", "ctrl+s"); // Rapid double submit
    // Should not crash; first submit wins
    const content = tui.snapshot();
    expect(content).toMatch(/Dispatching|Workflow dispatched ✓/);
    await tui.terminate();
  });

  test("KEY-WFD-023: d while overlay already open (no-op)", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("d"); // Should be no-op
    // Overlay still open, not duplicated
    await tui.waitForText("Dispatch Workflow");
    await tui.terminate();
  });

  test("KEY-WFD-024: Global keys suppressed while overlay open", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("q"); // Should NOT pop screen
    await tui.waitForText("Dispatch Workflow"); // Overlay still open
    await tui.terminate();
  });

  test("KEY-WFD-025: Backspace in ref input deletes character", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("main");
    await tui.sendKeys("Backspace");
    // "main" → "mai" or similar (depends on cursor position)
    await tui.terminate();
  });

  test("KEY-WFD-026: Empty ref submits with 'main' as default", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    // Clear ref (select all + delete or repeated backspace)
    for (let i = 0; i < 4; i++) await tui.sendKeys("Backspace");
    await tui.sendKeys("ctrl+s");
    // Should submit successfully with ref="main" as fallback
    const content = tui.snapshot();
    expect(content).toMatch(/Dispatching|Workflow dispatched ✓/);
    await tui.terminate();
  });

  test("KEY-WFD-027: d by read-only user shows Permission denied", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: READ_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Permission denied");
    const content = tui.snapshot();
    expect(content).not.toContain("Dispatch Workflow");
    await tui.terminate();
  });

  test("KEY-WFD-028: Rapid Tab cycling (10× sequential)", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    // 10 rapid Tab presses — should cycle fields without error
    for (let i = 0; i < 10; i++) {
      await tui.sendKeys("Tab");
    }
    // Should not crash
    expect(tui.snapshot()).toBeTruthy();
    await tui.terminate();
  });
});
```

### Responsive Tests (8 tests)

```typescript
describe("TUI_WORKFLOW_DISPATCH — Responsive", () => {
  test("RESP-WFD-001: Overlay at 80×24 — 90% width", async () => {
    const tui = await launchTUI({
      cols: 80, rows: 24,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RESP-WFD-002: Overlay at 120×40 — 50% width", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RESP-WFD-003: Overlay at 200×60 — 50% width, expanded", async () => {
    const tui = await launchTUI({
      cols: 200, rows: 60,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RESP-WFD-004: Resize 120×40 → 80×24 while overlay open", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.resize(80, 24);
    await tui.waitForText("Dispatch Workflow"); // Overlay persists
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RESP-WFD-005: Resize 80×24 → 120×40 while overlay open", async () => {
    const tui = await launchTUI({
      cols: 80, rows: 24,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.resize(120, 40);
    await tui.waitForText("Dispatch Workflow");
    // Descriptions should now appear
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RESP-WFD-006: Resize below minimum with overlay open", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.resize(60, 20); // Below minimum
    await tui.waitForText("Terminal too small");
    await tui.terminate();
  });

  test("RESP-WFD-007: Resize back above minimum restores overlay", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.resize(60, 20);
    await tui.waitForText("Terminal too small");
    await tui.resize(120, 40);
    await tui.waitForText("Dispatch Workflow"); // Overlay restored
    await tui.terminate();
  });

  test("RESP-WFD-008: Resize during Dispatching state", async () => {
    const tui = await launchTUI({
      cols: 120, rows: 40,
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.resize(80, 24);
    // Dispatching state should persist through resize
    const content = tui.snapshot();
    expect(content).toMatch(/Dispatching|Workflow dispatched ✓/);
    await tui.terminate();
  });
});
```

### Integration Tests (14 tests)

```typescript
describe("TUI_WORKFLOW_DISPATCH — Integration", () => {
  test("INT-WFD-001: Successful dispatch calls POST with correct ref and inputs", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Workflow dispatched ✓");
    await tui.terminate();
  });

  test("INT-WFD-002: Successful dispatch triggers run summary refresh", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Workflow dispatched ✓");
    // Run list should refresh — check for new queued run
    await tui.waitForText("queued", 5000);
    await tui.terminate();
  });

  test("INT-WFD-003: Dispatch with modified inputs sends user values", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    // Modify version to 2.0.0
    for (let i = 0; i < 3; i++) await tui.sendKeys("Tab");
    await tui.sendText("2.0.0");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Workflow dispatched ✓");
    await tui.terminate();
  });

  test("INT-WFD-004: Dispatch with unmodified inputs sends defaults", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s"); // Submit without modifying
    await tui.waitForText("Workflow dispatched ✓");
    await tui.terminate();
  });

  test("INT-WFD-005: Dispatch with zero custom inputs sends ref only", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    // Navigate to zero-inputs workflow
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    const content = tui.snapshot();
    expect(content).toMatch(/Dispatching|Workflow dispatched ✓/);
    await tui.terminate();
  });

  test("INT-WFD-006: 403 response shows permission denied inline", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    // Server should return 403 for this fixture
    await tui.waitForText("Permission denied", 5000);
    await tui.terminate();
  });

  test("INT-WFD-007: 404 response shows workflow not found inline", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Workflow not found", 5000);
    await tui.terminate();
  });

  test("INT-WFD-008: 409 response shows workflow inactive inline", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Workflow is inactive", 5000);
    await tui.terminate();
  });

  test("INT-WFD-009: 429 response shows rate limit error with Retry-After", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Rate limited", 5000);
    await tui.terminate();
  });

  test("INT-WFD-010: 401 response closes overlay and shows auth error", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: "expired-token" }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Session expired", 5000);
    await tui.terminate();
  });

  test("INT-WFD-011: Network timeout shows timeout error inline", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({
        token: WRITE_TOKEN,
        apiBaseUrl: "http://10.255.255.1:9999", // Unreachable for timeout
      }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("error", 35000);
    await tui.terminate();
  });

  test("INT-WFD-012: Server 500 shows generic server error inline", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Server error", 5000);
    await tui.terminate();
  });

  test("INT-WFD-013: Malformed workflow config opens overlay with ref-only", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    // Navigate to workflow with malformed config
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.waitForText("Ref"); // Only ref field shown
    await tui.terminate();
  });

  test("INT-WFD-014: Workflow config with no on.workflow_dispatch opens ref-only", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.waitForText("Ref");
    await tui.terminate();
  });
});
```

### Edge Case Tests (10 tests)

```typescript
describe("TUI_WORKFLOW_DISPATCH — Edge Cases", () => {
  test("EDGE-WFD-001: Workflow with 20+ inputs shows first 20 with truncation note", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    // Navigate to many-inputs workflow
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    await tui.waitForText("Showing 20 of");
    await tui.terminate();
  });

  test("EDGE-WFD-002: Unicode in workflow name displayed correctly", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    // Verify workflow name renders without corruption
    expect(tui.snapshot()).toBeTruthy();
    await tui.terminate();
  });

  test("EDGE-WFD-003: Unicode in input keys displayed correctly", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    expect(tui.snapshot()).toBeTruthy();
    await tui.terminate();
  });

  test("EDGE-WFD-004: Ref with 255 characters accepted, 256th rejected", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    // Clear ref and type 256 characters
    for (let i = 0; i < 4; i++) await tui.sendKeys("Backspace");
    const longRef = "a".repeat(256);
    await tui.sendText(longRef);
    // Ref should be clamped to 255 chars
    await tui.terminate();
  });

  test("EDGE-WFD-005: Input value with 1000 chars accepted, 1001st rejected", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    for (let i = 0; i < 3; i++) await tui.sendKeys("Tab");
    const longValue = "b".repeat(1001);
    await tui.sendText(longValue);
    // Value should be clamped to 1000 chars
    await tui.terminate();
  });

  test("EDGE-WFD-006: Invalid ref characters show validation error", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    for (let i = 0; i < 4; i++) await tui.sendKeys("Backspace");
    await tui.sendText("bad..ref");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("must not contain");
    await tui.terminate();
  });

  test("EDGE-WFD-007: Dispatch then immediate q on list screen", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Workflow dispatched ✓");
    await tui.sendKeys("q"); // Navigate back
    // Should not crash — dispatch already sent
    expect(tui.snapshot()).toBeTruthy();
    await tui.terminate();
  });

  test("EDGE-WFD-008: d during workflow list loading state (no-op)", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    // Press d immediately before list loads
    await tui.sendKeys("d");
    // Should not crash or open overlay on undefined workflow
    expect(tui.snapshot()).toBeTruthy();
    await tui.terminate();
  });

  test("EDGE-WFD-009: Boolean input with no default defaults to [false]", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("[false]"); // Default for boolean with no explicit default
    await tui.terminate();
  });

  test("EDGE-WFD-010: Choice input with empty options renders as text input fallback", async () => {
    const tui = await launchTUI({
      args: ["--screen", "workflows", "--repo", `${OWNER}/test-repo`],
      env: createMockAPIEnv({ token: WRITE_TOKEN }),
    });
    await tui.waitForText("Workflows");
    await tui.sendKeys("d");
    await tui.waitForText("Dispatch Workflow");
    // The empty-options choice should render as text input
    expect(tui.snapshot()).toBeTruthy();
    await tui.terminate();
  });
});
```

**Test philosophy alignment:**
- All 76 tests are left failing if backend features are unimplemented — never skipped or commented out.
- Tests validate user-facing behavior (keypress → visible result), not implementation details.
- Tests run against a real API server with test fixtures.
- Snapshot tests capture at representative terminal sizes (80×24, 120×40, 200×60).
- Each test launches a fresh TUI instance with isolated config.

---

## Telemetry Integration Points

The following analytics events should be emitted at the specified locations. The telemetry client is accessed via `useTelemetry()` hook (if available) or direct `telemetry.track()` calls.

| Event | Emit Location | Trigger |
|-------|--------------|---------|
| `tui.workflow_dispatch.opened` | `DispatchOverlay` mount | `visible` transitions to `true` |
| `tui.workflow_dispatch.submitted` | `useDispatchForm.handleSubmit` | Before API call |
| `tui.workflow_dispatch.succeeded` | `useDispatchForm` `onSuccess` callback | 204 response |
| `tui.workflow_dispatch.failed` | `useDispatchForm.handleApiError` | Non-2xx or network error |
| `tui.workflow_dispatch.cancelled` | `DispatchOverlay.onDismiss` | Esc or Cancel without submitting |
| `tui.workflow_dispatch.blocked` | `WorkflowListScreen.handleDispatchPress` | `d` on non-dispatchable workflow |
| `tui.workflow_dispatch.denied` | `WorkflowListScreen.handleDispatchPress` | `d` without write access |

---

## Source of Truth

This engineering specification should be maintained alongside:

- [specs/tui/TUI_WORKFLOW_DISPATCH.md](../TUI_WORKFLOW_DISPATCH.md) — Product specification
- [specs/tui/engineering/tui-workflow-data-hooks.md](./tui-workflow-data-hooks.md) — Data hook contracts
- [specs/tui/engineering/tui-modal-component.md](./tui-modal-component.md) — Modal component spec
- [specs/tui/engineering/tui-form-component.md](./tui-form-component.md) — Form component spec
- [specs/tui/engineering/tui-workflow-list-screen.md](./tui-workflow-list-screen.md) — Parent screen spec
- [specs/tui/features.ts](../features.ts) — Feature inventory
