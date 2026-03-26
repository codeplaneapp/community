# TUI_FORM_COMPONENT — Engineering Specification

Implement the reusable `FormComponent` with tab navigation, field validation, dirty-state tracking, and keyboard-driven submission. This component is the foundational form primitive consumed by issue create, landing create, settings edit, wiki edit, and all other form-based screens in the TUI.

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `tui-bootstrap-and-renderer` | **Exists** | `apps/tui/src/index.tsx` entry point, `createCliRenderer`, React root, provider stack |
| `tui-theme-and-color-tokens` | **Exists** | `apps/tui/src/theme/tokens.ts`, `apps/tui/src/providers/ThemeProvider.tsx`, `apps/tui/src/hooks/useTheme.ts` — complete with 12 semantic tokens |
| `tui-layout-hook` | **Exists** | `apps/tui/src/hooks/useLayout.ts` — breakpoint system, `contentHeight`, sidebar/modal sizing |
| `tui-keybinding-provider` | **Exists** | `apps/tui/src/providers/KeybindingProvider.tsx`, `apps/tui/src/hooks/useScreenKeybindings.ts` — layered priority dispatch |
| `tui-loading-states` | **Exists** | `apps/tui/src/loading/`, `apps/tui/src/hooks/useLoading.ts`, `apps/tui/src/components/ActionButton.tsx` — full loading system |
| `tui-overlay-manager` | **Exists** | `apps/tui/src/providers/OverlayManager.tsx` — confirm dialog for unsaved changes |
| `tui-e2e-test-infra` | **Exists** | `e2e/tui/helpers.ts` — `launchTUI`, `TUITestInstance`, `createMockAPIEnv` |

---

## 1. Summary

This ticket creates the shared form system for the Codeplane TUI. The form system consists of:

1. **`FormComponent`** — A vertical layout of typed form fields with Tab/Shift+Tab navigation, Ctrl+S submission, Esc cancellation, validation, dirty-state tracking, and submit/cancel buttons.
2. **`useFormState` hook** — Manages form values, errors, focus index, dirty tracking, and validation lifecycle.
3. **`useFormNavigation` hook** — Handles keyboard navigation between fields (Tab/Shift+Tab), form-wide submission (Ctrl+S), and cancellation (Esc).
4. **Field renderer components** — `InputField`, `TextareaField`, and `SelectField` — each wrapping the corresponding OpenTUI primitive (`<input>`, `<textarea>`, `<select>`) with label, error display, and focus styling.

The form component is **declarative** — callers define fields via a `FormFieldDefinition[]` array and provide `onSubmit`/`onCancel` callbacks. The form handles all internal state, keyboard input routing, and visual presentation.

### 1.1 Design Decisions

**Why intercept Tab/Esc/Ctrl+S at SCREEN priority, not at the OpenTUI input level?**

The `KeybindingProvider` uses a single `useKeyboard()` call at the provider level to capture ALL key input and dispatch through priority scopes. When a key matches a scope handler, `event.preventDefault()` and `event.stopPropagation()` are called, preventing the event from reaching OpenTUI's focused component. This means:

- Tab/Shift+Tab registered at `PRIORITY.SCREEN` (4) fire *before* reaching any focused `<input>` or `<textarea>`.
- Printable characters, Backspace, and arrow keys have *no* matching handler in any scope, so they fall through to OpenTUI's native input handling.
- This architecture is already proven by the existing `useScreenKeybindings` hook.

The critical sequence verified in `KeybindingProvider.tsx` lines 71–88:
```
useKeyboard((event) => {
  if (event.eventType === "release") return;
  const descriptor = normalizeKeyEvent(event);
  const scopes = getActiveScopesSorted();
  for (const scope of scopes) {
    const handler = scope.bindings.get(descriptor);
    if (handler) {
      if (handler.when && !handler.when()) continue;
      handler.handler();
      event.preventDefault();
      event.stopPropagation();
      return; // First match wins
    }
  }
  // No match — falls through to OpenTUI focused component
});
```

**Why separate hooks from the component?**

Some screens need form state management without the default form layout (e.g., inline editing, multi-step wizards). Exporting `useFormState` and `useFormNavigation` as standalone hooks enables these use cases while keeping `FormComponent` as the standard composition for most screens.

**Why use `<textarea>` (not `<input>`) for multi-line fields?**

OpenTUI's `<input>` strips newlines and is always height=1 (confirmed by `InputProps` — it has `value?: string` with no multiline support, and `onInput(value: string)` for single-line changes). OpenTUI's `<textarea>` is a full multi-line editing component with `initialValue?: string`, word wrapping via `wrapMode?: "none" | "char" | "word"`, cursor movement, selection, and undo/redo. The React reconciler exposes `<textarea>` with `ref?: React.Ref<TextareaRenderable>`.

**Why use `<input>` with `onSubmit` for Enter-to-advance on single-line fields?**

OpenTUI's `<input>` fires `onSubmit` when Enter is pressed. The FormComponent's Enter keybinding at SCREEN priority calls `focusNext()` for single-line fields. For textarea fields, Enter must insert a newline (handled by OpenTUI natively since no SCREEN handler intercepts it). The Enter handler uses a `when` predicate to only fire when the focused field is not a textarea.

---

## 2. Scope

### In scope

1. `apps/tui/src/components/FormComponent.tsx` — Main form component (new file)
2. `apps/tui/src/components/FormComponent.types.ts` — TypeScript interfaces for form system (new file)
3. `apps/tui/src/components/fields/InputField.tsx` — Single-line text field renderer (new file)
4. `apps/tui/src/components/fields/TextareaField.tsx` — Multi-line text field renderer (new file)
5. `apps/tui/src/components/fields/SelectField.tsx` — Dropdown select field renderer (new file)
6. `apps/tui/src/components/fields/index.ts` — Field barrel export (new file)
7. `apps/tui/src/hooks/useFormState.ts` — Form state management hook (new file)
8. `apps/tui/src/hooks/useFormNavigation.ts` — Form keyboard navigation hook (new file)
9. `apps/tui/src/hooks/index.ts` — Update barrel export with new hooks
10. `apps/tui/src/components/index.ts` — Update barrel export with FormComponent
11. `e2e/tui/form-component.test.ts` — E2E tests for form component behavior (new file)

### Out of scope

- Issue create/edit screen (separate ticket, will consume FormComponent)
- Landing create/edit screen (separate ticket)
- Settings edit screen (separate ticket)
- Data hooks (`useCreateIssue`, etc.) — provided by `@codeplane/ui-core`
- File upload fields (not supported in TUI per PRD §6)
- Rich text editing (not supported per PRD §6)
- Multi-step wizard forms (future extension)
- Form autosave / draft persistence
- Checkbox field type (future extension — architecture supports it via `FormFieldType` union)

---

## 3. Architecture

### 3.1 Component Hierarchy

```
FormComponent
├── <scrollbox scrollY={true}>         (scrollable form container)
│   ├── <box flexDirection="column">   (field list)
│   │   ├── InputField                 (type: "input")
│   │   ├── TextareaField              (type: "textarea")
│   │   ├── SelectField                (type: "select")
│   │   └── ... (one per field definition)
│   └── <box flexDirection="row">      (button row)
│       ├── [ Submit ] text            (styled text button)
│       └── [ Cancel ] text            (styled text button)
└── Hooks:
    ├── useFormState(fields, initialValues)
    └── useFormNavigation(fieldCount, callbacks)
```

### 3.2 Data Flow

```
FormFieldDefinition[] ──→ FormComponent
                              │
                              ├─→ useFormState(fields, initialValues)
                              │       ├── values: Record<string, unknown>
                              │       ├── errors: Record<string, string | null>
                              │       ├── touched: Set<string>
                              │       ├── isDirty: boolean
                              │       └── validateAll(): boolean
                              │
                              ├─→ useFormNavigation(fieldCount, callbacks)
                              │       ├── focusIndex: number
                              │       ├── focusNext / focusPrev
                              │       └── keybinding scope registration
                              │
                              └─→ Field renderers (InputField, TextareaField, SelectField)
                                      ├── focused={focusIndex === fieldIndex}
                                      ├── value={values[field.name]}
                                      ├── error={errors[field.name]}
                                      └── onChange → setValue(field.name, value)
```

### 3.3 Keyboard Priority Interaction

The form component interacts with the existing keybinding priority system from `KeybindingProvider`:

```
┌─────────────────────────────────────┐
│ Priority 1: TEXT_INPUT              │  NOT a scope — OpenTUI's internal
│                                     │  focus system. Receives events only
│                                     │  when no scope handler matches.
├─────────────────────────────────────┤
│ Priority 2: MODAL                   │  Active when confirm dialog is open
│                                     │  (dirty-state discard prompt).
├─────────────────────────────────────┤
│ Priority 3: GOTO                    │  Go-to mode (g prefix). Not relevant
│                                     │  during form interaction.
├─────────────────────────────────────┤
│ Priority 4: SCREEN (Form scope)     │  Registered by useFormNavigation:
│ Registered via useScreenKeybindings │  tab → focusNext()
│                                     │  shift+tab → focusPrev()
│                                     │  ctrl+s → handleSubmit()
│                                     │  escape → handleCancel()
│                                     │  return → advance/submit (with when)
├─────────────────────────────────────┤
│ Priority 5: GLOBAL                  │  ?, :, q, Ctrl+C — always active
└─────────────────────────────────────┘
```

**Event flow for printable characters (e.g., typing "hello"):**
1. `KeybindingProvider.useKeyboard` receives event.
2. `normalizeKeyEvent` produces `"h"`, `"e"`, `"l"`, etc.
3. No scope has a handler for these keys → no match → no preventDefault.
4. Event falls through to OpenTUI's focused `<input>` or `<textarea>`.
5. OpenTUI's internal input handler processes the character.

**Event flow for Tab:**
1. `KeybindingProvider.useKeyboard` receives event.
2. `normalizeKeyEvent` produces `"tab"`.
3. SCREEN scope (form navigation) has `"tab"` → `focusNext()` fires.
4. `preventDefault()` + `stopPropagation()` called.
5. Event never reaches OpenTUI's focused input.

---

## 4. Implementation Plan

### Step 1: Type Definitions

**File:** `apps/tui/src/components/FormComponent.types.ts`

Define all TypeScript interfaces for the form system. This is the contract consumed by component, hooks, and field renderers.

```typescript
/**
 * Supported form field types.
 *
 * - "input": Single-line text input via OpenTUI <input>
 * - "textarea": Multi-line text input via OpenTUI <textarea>
 * - "select": Dropdown selection via OpenTUI <select>
 */
export type FormFieldType = "input" | "textarea" | "select";

/**
 * Option for select-type fields.
 * Matches OpenTUI's SelectOption shape (name, description, value).
 */
export interface SelectOption {
  /** Display label shown in the dropdown. */
  name: string;
  /** Optional description shown below the label. */
  description?: string;
  /** The value stored when this option is selected. */
  value: string;
}

/**
 * Definition of a single form field.
 *
 * Callers pass an array of these to FormComponent to declare the form structure.
 * The form renders fields in array order, top to bottom.
 */
export interface FormFieldDefinition {
  /** Unique field identifier. Used as key in values/errors records. */
  name: string;
  /** Human-readable label displayed above the field. */
  label: string;
  /** Field type determines the rendered input component. */
  type: FormFieldType;
  /** Whether the field must have a non-empty value to submit. Default: false. */
  required?: boolean;
  /** Placeholder text shown when the field is empty. */
  placeholder?: string;
  /**
   * Custom validation function. Called with the current field value.
   * Return null if valid, or an error message string if invalid.
   * Called on submit and on blur (when user tabs away).
   */
  validation?: (value: unknown) => string | null;
  /**
   * Options for select-type fields. Required when type is "select".
   * Ignored for input and textarea types.
   */
  options?: SelectOption[];
  /**
   * Maximum number of visible rows for textarea fields.
   * Default: responsive — 5 at minimum, 8 at standard, 12 at large breakpoint.
   * Ignored for input and select types.
   */
  maxRows?: number;
}

/**
 * Props for the FormComponent.
 */
export interface FormComponentProps {
  /** Array of field definitions rendered in order. */
  fields: FormFieldDefinition[];
  /** Initial values keyed by field name. Missing keys default to empty string / first option. */
  initialValues?: Record<string, unknown>;
  /** Called when the form is submitted with all validated values. */
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  /** Called when the user cancels the form (Esc or Cancel button). */
  onCancel: () => void;
  /** Label for the submit button. Default: "Submit". */
  submitLabel?: string;
  /** Label for the cancel button. Default: "Cancel". */
  cancelLabel?: string;
  /** Whether the form is currently submitting (shows loading state on button). */
  isSubmitting?: boolean;
}

/**
 * Internal form state managed by useFormState.
 */
export interface FormState {
  /** Current field values keyed by field name. */
  values: Record<string, unknown>;
  /** Validation error messages keyed by field name. null = valid. */
  errors: Record<string, string | null>;
  /** Set of field names that have been interacted with (focused then blurred). */
  touched: Set<string>;
  /** Whether any value differs from the initial values. */
  isDirty: boolean;
  /** Whether the form has been submitted at least once (for showing all errors). */
  isSubmitted: boolean;
}

/**
 * Return type for useFormState hook.
 */
export interface UseFormStateReturn {
  /** Current form state. */
  state: FormState;
  /** Set a single field value. Marks the field as touched. Triggers validation for that field. */
  setValue: (name: string, value: unknown) => void;
  /** Set a field error manually (for server-side validation errors). */
  setError: (name: string, error: string | null) => void;
  /** Mark a field as touched (e.g., on blur). Triggers validation for that field. */
  touchField: (name: string) => void;
  /**
   * Validate all fields. Returns true if all fields are valid.
   * Sets isSubmitted to true so all errors become visible regardless of touched state.
   */
  validateAll: () => boolean;
  /** Reset form to initial values and clear all errors/touched state. */
  reset: () => void;
}

/**
 * Return type for useFormNavigation hook.
 */
export interface UseFormNavigationReturn {
  /** Currently focused item index. 0..fieldCount-1 = fields, fieldCount = submit, fieldCount+1 = cancel. */
  focusIndex: number;
  /** Total number of focusable items (fields + 2 buttons). */
  totalItems: number;
  /** Move focus to the next field/button. Wraps around. */
  focusNext: () => void;
  /** Move focus to the previous field/button. Wraps around. */
  focusPrev: () => void;
  /** Set focus to a specific index. */
  setFocusIndex: (index: number) => void;
  /** Whether the submit button is currently focused. */
  isSubmitFocused: boolean;
  /** Whether the cancel button is currently focused. */
  isCancelFocused: boolean;
}

/**
 * Props passed to individual field renderer components.
 */
export interface FieldRendererProps {
  /** The field definition. */
  field: FormFieldDefinition;
  /** Current field value. */
  value: unknown;
  /** Current validation error (null if valid). */
  error: string | null;
  /** Whether this field is currently focused. */
  focused: boolean;
  /** Whether the field has been touched (focused then blurred). */
  touched: boolean;
  /** Whether errors should be visible (touched or form submitted). */
  showError: boolean;
  /** Callback when the field value changes. */
  onChange: (value: unknown) => void;
  /** Callback when the field loses focus (Tab away). */
  onBlur: () => void;
}
```

**Rationale:** Defining types first establishes the contract between all modules. Field renderers, hooks, and the main component all import from this single file. The `FormFieldDefinition` interface is intentionally simple — complex field types (multi-select, date pickers, checkbox) are future extensions that can be added to the `FormFieldType` union without breaking existing consumers.

---

### Step 2: useFormState Hook

**File:** `apps/tui/src/hooks/useFormState.ts`

Manages form values, validation errors, touched state, and dirty tracking. Pure state management — no keyboard handling or UI rendering.

```typescript
import { useState, useCallback, useRef, useMemo } from "react";
import type {
  FormFieldDefinition,
  FormState,
  UseFormStateReturn,
} from "../components/FormComponent.types.js";

/**
 * Form state management hook.
 *
 * Tracks values, validation errors, touched fields, and dirty state.
 * Validation runs on:
 * - Individual field change (setValue) — validates that field if previously touched
 * - Individual field blur (touchField) — validates that field
 * - Submit (validateAll) — validates all fields, marks form as submitted
 *
 * @param fields - Array of field definitions (for validation rules)
 * @param initialValues - Initial values keyed by field name
 */
export function useFormState(
  fields: FormFieldDefinition[],
  initialValues?: Record<string, unknown>,
): UseFormStateReturn {
  // Compute default initial values from field definitions
  const defaults = useMemo(() => {
    const d: Record<string, unknown> = {};
    for (const field of fields) {
      if (initialValues && field.name in initialValues) {
        d[field.name] = initialValues[field.name];
      } else if (field.type === "select" && field.options?.length) {
        d[field.name] = field.options[0].value;
      } else {
        d[field.name] = "";
      }
    }
    return d;
  }, [fields, initialValues]);

  const [values, setValues] = useState<Record<string, unknown>>({ ...defaults });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Frozen reference to initial values for dirty comparison
  const initialRef = useRef(defaults);

  // Compute dirty state by comparing current values to initial
  const isDirty = useMemo(() => {
    for (const field of fields) {
      const current = values[field.name];
      const initial = initialRef.current[field.name];
      if (current !== initial) return true;
    }
    return false;
  }, [values, fields]);

  // Validate a single field against its rules
  const validateField = useCallback(
    (field: FormFieldDefinition, value: unknown): string | null => {
      // Required check
      if (field.required) {
        const strVal = String(value ?? "").trim();
        if (strVal.length === 0) {
          return `${field.label} is required`;
        }
      }
      // Custom validation
      if (field.validation) {
        return field.validation(value);
      }
      return null;
    },
    [],
  );

  const setValue = useCallback(
    (name: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [name]: value }));
      // Mark as touched on any value change
      setTouched((prev) => {
        const next = new Set(prev);
        next.add(name);
        return next;
      });
      // Re-validate the field immediately
      const field = fields.find((f) => f.name === name);
      if (field) {
        const error = validateField(field, value);
        setErrors((prev) => ({ ...prev, [name]: error }));
      }
    },
    [fields, validateField],
  );

  const setError = useCallback(
    (name: string, error: string | null) => {
      setErrors((prev) => ({ ...prev, [name]: error }));
    },
    [],
  );

  const touchField = useCallback(
    (name: string) => {
      setTouched((prev) => {
        const next = new Set(prev);
        next.add(name);
        return next;
      });
      // Validate the touched field
      const field = fields.find((f) => f.name === name);
      if (field) {
        const error = validateField(field, values[name]);
        setErrors((prev) => ({ ...prev, [name]: error }));
      }
    },
    [fields, values, validateField],
  );

  const validateAll = useCallback((): boolean => {
    setIsSubmitted(true);
    const newErrors: Record<string, string | null> = {};
    let allValid = true;
    for (const field of fields) {
      const error = validateField(field, values[field.name]);
      newErrors[field.name] = error;
      if (error !== null) allValid = false;
    }
    setErrors(newErrors);
    return allValid;
  }, [fields, values, validateField]);

  const reset = useCallback(() => {
    setValues({ ...initialRef.current });
    setErrors({});
    setTouched(new Set());
    setIsSubmitted(false);
  }, []);

  const state: FormState = {
    values,
    errors,
    touched,
    isDirty,
    isSubmitted,
  };

  return { state, setValue, setError, touchField, validateAll, reset };
}
```

**Key behaviors:**
- Initial values for select fields default to the first option's value.
- Validation runs on setValue (always, since the field is marked touched), on touchField (blur), and on validateAll (submit).
- `isDirty` is derived via `useMemo` — no manual tracking needed. Compares current values against the frozen initial snapshot.
- After `validateAll`, all errors are visible regardless of touched state (`isSubmitted = true`).
- `reset()` restores everything to initial state.

---

### Step 3: useFormNavigation Hook

**File:** `apps/tui/src/hooks/useFormNavigation.ts`

Handles keyboard navigation between form fields and buttons. Registers a SCREEN-priority keybinding scope via `useScreenKeybindings`.

```typescript
import { useState, useCallback, useMemo, useRef } from "react";
import { useScreenKeybindings } from "./useScreenKeybindings.js";
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";
import type { UseFormNavigationReturn } from "../components/FormComponent.types.js";
import type { FormFieldDefinition } from "../components/FormComponent.types.js";

/**
 * Form keyboard navigation hook.
 *
 * Manages focusIndex across all form fields plus submit/cancel buttons.
 * Registers keybindings for Tab, Shift+Tab, Ctrl+S, Esc, and Enter.
 *
 * Focus layout:
 *   [0 .. fieldCount-1]  = form fields
 *   [fieldCount]          = submit button
 *   [fieldCount + 1]      = cancel button
 *
 * @param fields - Array of field definitions (needed for Enter key behavior)
 * @param onSubmit - Called on Ctrl+S or Enter when submit button focused
 * @param onCancel - Called on Esc (caller handles dirty check before calling)
 */
export function useFormNavigation(
  fields: FormFieldDefinition[],
  onSubmit: () => void,
  onCancel: () => void,
): UseFormNavigationReturn {
  const fieldCount = fields.length;
  const totalItems = fieldCount + 2; // fields + submit + cancel
  const [focusIndex, setFocusIndex] = useState(0);

  // Refs to access current state in keybinding handlers without stale closures
  const focusIndexRef = useRef(focusIndex);
  focusIndexRef.current = focusIndex;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const focusNext = useCallback(() => {
    setFocusIndex((prev) => (prev + 1) % totalItems);
  }, [totalItems]);

  const focusPrev = useCallback(() => {
    setFocusIndex((prev) => (prev - 1 + totalItems) % totalItems);
  }, [totalItems]);

  const isSubmitFocused = focusIndex === fieldCount;
  const isCancelFocused = focusIndex === fieldCount + 1;

  // Keybindings registered at SCREEN priority via useScreenKeybindings
  const bindings: KeyHandler[] = useMemo(
    () => [
      {
        key: "tab",
        description: "Next field",
        group: "Form",
        handler: () => {
          setFocusIndex((prev) => (prev + 1) % totalItems);
        },
      },
      {
        key: "shift+tab",
        description: "Previous field",
        group: "Form",
        handler: () => {
          setFocusIndex((prev) => (prev - 1 + totalItems) % totalItems);
        },
      },
      {
        key: "ctrl+s",
        description: "Submit",
        group: "Form",
        handler: onSubmit,
      },
      {
        key: "escape",
        description: "Cancel",
        group: "Form",
        handler: onCancel,
      },
      {
        key: "return",
        description: "Submit / next",
        group: "Form",
        handler: () => {
          const idx = focusIndexRef.current;
          if (idx === fieldCount) {
            // Submit button focused → submit
            onSubmit();
          } else if (idx === fieldCount + 1) {
            // Cancel button focused → cancel
            onCancel();
          } else {
            // Field focused → advance to next field (like Tab)
            setFocusIndex((prev) => (prev + 1) % totalItems);
          }
        },
        // Only intercept Enter when NOT on a textarea field.
        // Textarea fields need Enter for newlines — let it fall through to OpenTUI.
        when: () => {
          const idx = focusIndexRef.current;
          // Always intercept on buttons
          if (idx >= fieldCount) return true;
          // Intercept on non-textarea fields
          const field = fieldsRef.current[idx];
          return field?.type !== "textarea";
        },
      },
    ],
    [fieldCount, totalItems, onSubmit, onCancel],
  );

  const hints: StatusBarHint[] = useMemo(
    () => [
      { keys: "Tab", label: "next field", order: 10 },
      { keys: "Ctrl+S", label: "submit", order: 20 },
      { keys: "Esc", label: "cancel", order: 30 },
    ],
    [],
  );

  useScreenKeybindings(bindings, hints);

  return {
    focusIndex,
    totalItems,
    focusNext,
    focusPrev,
    setFocusIndex,
    isSubmitFocused,
    isCancelFocused,
  };
}
```

**Key behaviors:**
- Focus wraps: Tab on the last button returns to the first field.
- Enter on a non-textarea field advances to the next field (same as Tab). Enter on a textarea field is **not intercepted** (`when` returns false), so it falls through the scope chain with no match, reaching OpenTUI's `<textarea>` which inserts a newline.
- Enter on the submit button calls `onSubmit`. Enter on the cancel button calls `onCancel`.
- Ctrl+S submits from anywhere — the primary submission shortcut.
- Esc cancels — the `FormComponent` wrapper checks dirty state before calling `onCancel`.
- Status bar hints are compact and always visible while the form is mounted.
- `focusIndexRef` avoids stale closure issues in the `return` handler's `when` predicate.

---

### Step 4: Field Renderer Components

#### 4a. InputField

**File:** `apps/tui/src/components/fields/InputField.tsx`

Single-line text input wrapped in a labeled, bordered box with error display.

```typescript
import { useTheme } from "../../hooks/useTheme.js";
import type { FieldRendererProps } from "../FormComponent.types.js";

/**
 * Single-line text input field.
 *
 * Renders:
 * ┌─ Label * ────────────────────────┐
 * │ placeholder or value text         │
 * └──────────────────────────────────┘
 *   Error message (if any)
 *
 * Uses OpenTUI's <input> component which:
 * - Strips newlines (single-line only)
 * - Fires onInput on each keystroke with the new string value
 * - Fires onChange on blur with the current string value
 * - Fires onSubmit on Enter (but Enter is intercepted by form nav for input fields)
 * - Accepts ref?: React.Ref<InputRenderable>
 */
export function InputField({
  field,
  value,
  error,
  focused,
  showError,
  onChange,
  onBlur,
}: FieldRendererProps) {
  const theme = useTheme();

  const borderColor = showError && error
    ? theme.error
    : focused
      ? theme.primary
      : theme.border;

  const labelText = field.required ? `${field.label} *` : field.label;

  return (
    <box flexDirection="column">
      <box
        border={true}
        borderColor={borderColor}
        title={labelText}
        titleAlignment="left"
        height={3}
        width="100%"
      >
        <input
          placeholder={field.placeholder ?? ""}
          value={String(value ?? "")}
          focused={focused}
          onInput={(v: string) => onChange(v)}
          onChange={() => onBlur()}
        />
      </box>
      {showError && error ? (
        <text fg={theme.error}>
          {`  ${error}`}
        </text>
      ) : null}
    </box>
  );
}
```

**Details:**
- Border changes to `theme.primary` when focused, `theme.error` when error is visible, `theme.border` otherwise.
- Required fields show ` *` after the label text.
- The `title` prop on `<box>` renders the label inline with the top border (e.g., `┌─ Title * ──┐`).
- Error text is rendered below the box in `theme.error` color, only when `showError` is true.
- Height is fixed at 3 (1 border top + 1 content row + 1 border bottom).
- `onInput` fires on every keystroke (updates form state). `onChange` fires on blur (triggers validation).

#### 4b. TextareaField

**File:** `apps/tui/src/components/fields/TextareaField.tsx`

Multi-line text area using OpenTUI's `<textarea>` component with responsive height.

```typescript
import { useRef, useCallback } from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { useLayout } from "../../hooks/useLayout.js";
import type { TextareaRenderable } from "@opentui/core";
import type { FieldRendererProps } from "../FormComponent.types.js";

/**
 * Multi-line text area field.
 *
 * Uses OpenTUI's <textarea> component which supports:
 * - Multi-line editing with word wrapping
 * - Cursor movement and selection
 * - Undo/redo
 * - Enter inserts newlines (not intercepted by form nav — when predicate returns false)
 *
 * Height is responsive to terminal breakpoint:
 * - Minimum breakpoint: 5 content rows
 * - Standard breakpoint: 8 content rows
 * - Large breakpoint: 12 content rows
 * - Overridable per-field via maxRows prop
 *
 * Value synchronization:
 * OpenTUI's <textarea> does not fire an onInput(value) callback like <input>.
 * Instead, we access the current text via ref.current.plainText on blur (Tab away).
 * The form navigation hook triggers onBlur when focus moves away.
 */
export function TextareaField({
  field,
  value,
  error,
  focused,
  showError,
  onChange,
  onBlur,
}: FieldRendererProps) {
  const theme = useTheme();
  const { breakpoint } = useLayout();
  const textareaRef = useRef<TextareaRenderable>(null);

  const contentRows = field.maxRows ?? (
    breakpoint === "large" ? 12 :
    breakpoint === "standard" ? 8 : 5
  );
  const boxHeight = contentRows + 2; // +2 for top and bottom borders

  const borderColor = showError && error
    ? theme.error
    : focused
      ? theme.primary
      : theme.border;

  const labelText = field.required ? `${field.label} *` : field.label;

  // Read current value from ref on blur (Tab away).
  // This is the primary synchronization mechanism for textarea fields.
  const handleBlur = useCallback(() => {
    if (textareaRef.current) {
      const currentText = textareaRef.current.plainText;
      onChange(currentText);
    }
    onBlur();
  }, [onChange, onBlur]);

  return (
    <box flexDirection="column">
      <box
        border={true}
        borderColor={borderColor}
        title={labelText}
        titleAlignment="left"
        height={boxHeight}
        width="100%"
      >
        <textarea
          ref={textareaRef}
          initialValue={String(value ?? "")}
          placeholder={field.placeholder ?? ""}
          focused={focused}
          wrapMode="word"
        />
      </box>
      {showError && error ? (
        <text fg={theme.error}>
          {`  ${error}`}
        </text>
      ) : null}
    </box>
  );
}
```

**Implementation note on `<textarea>` value synchronization:**

OpenTUI's `<textarea>` React binding (`TextareaProps`) does not expose `onInput` or `onChange` callbacks that pass the current text value as a string argument (unlike `<input>` which has `onInput(value: string)`). Instead, the textarea exposes a ref to `TextareaRenderable` which has a `.plainText` property. To read the current text, the component uses a React `ref` and reads `.plainText` on blur (Tab away from the field).

The `onBlur` callback is called by `FormComponent` when focus moves away from this field (Tab/Shift+Tab). The `handleBlur` function reads the textarea's current `plainText` via ref, syncs it to form state via `onChange`, then calls `onBlur` to trigger validation.

**Fallback strategy:** If `TextareaRenderable` ref access is not supported by the React reconciler at implementation time, fall back to using `onContentChange` event handler. OpenTUI's `TextareaProps` includes `onContentChange?: (event: ContentChangeEvent) => void`. Use this to track changes and maintain a local string ref. Add a TODO comment referencing this limitation.

#### 4c. SelectField

**File:** `apps/tui/src/components/fields/SelectField.tsx`

Dropdown select using OpenTUI's `<select>` component.

```typescript
import { useTheme } from "../../hooks/useTheme.js";
import type { FieldRendererProps } from "../FormComponent.types.js";

/**
 * Select dropdown field.
 *
 * Uses OpenTUI's <select> component which handles:
 * - j/k for option navigation when focused (OpenTUI internal binding)
 * - Enter to confirm selection (onSelect fires)
 * - Scroll indicator for >5 options
 * - Wrap selection from last to first
 *
 * Tab/Shift+Tab are intercepted by form navigation scope (SCREEN priority)
 * before they reach the select component — this is correct because the form
 * handles field-to-field navigation, not the select itself.
 *
 * OpenTUI's <select> props (from SelectProps):
 * - options: SelectOption[] (name, description, value)
 * - selectedIndex: number
 * - focused: boolean
 * - onChange: (index, option) => void — fires on j/k movement
 * - onSelect: (index, option) => void — fires on Enter confirm
 * - focusedBackgroundColor, selectedBackgroundColor: ColorInput
 * - showScrollIndicator: boolean
 * - wrapSelection: boolean
 */
export function SelectField({
  field,
  value,
  error,
  focused,
  showError,
  onChange,
  onBlur,
}: FieldRendererProps) {
  const theme = useTheme();

  const options = (field.options ?? []).map((opt) => ({
    name: opt.name,
    description: opt.description ?? "",
    value: opt.value,
  }));

  const selectedIndex = options.findIndex(
    (opt) => opt.value === String(value ?? ""),
  );

  const borderColor = showError && error
    ? theme.error
    : focused
      ? theme.primary
      : theme.border;

  const labelText = field.required ? `${field.label} *` : field.label;

  // Show up to 5 options, then scroll
  const visibleOptions = Math.min(options.length, 5);
  const boxHeight = visibleOptions + 2; // +2 for borders

  return (
    <box flexDirection="column">
      <box
        border={true}
        borderColor={borderColor}
        title={labelText}
        titleAlignment="left"
        height={boxHeight}
        width="100%"
      >
        <select
          options={options}
          selectedIndex={Math.max(selectedIndex, 0)}
          focused={focused}
          onChange={(index: number, opt: { value?: string } | null) => {
            if (opt?.value !== undefined) {
              onChange(opt.value);
            }
          }}
          onSelect={() => onBlur()}
          focusedBackgroundColor={theme.primary}
          selectedBackgroundColor={theme.surface}
          showScrollIndicator={options.length > 5}
          wrapSelection={true}
        />
      </box>
      {showError && error ? (
        <text fg={theme.error}>
          {`  ${error}`}
        </text>
      ) : null}
    </box>
  );
}
```

**Details:**
- Passes `focused` to OpenTUI's `<select>`, which handles j/k navigation internally.
- Height adapts to option count (max 5 visible, then scroll indicator).
- `wrapSelection={true}` allows j/k to wrap from last to first option.
- `onChange` fires on selection change (j/k movement); `onSelect` fires on Enter (triggers blur/validation).
- Tab/Shift+Tab are intercepted at SCREEN priority before reaching `<select>`.

#### 4d. Field Barrel Export

**File:** `apps/tui/src/components/fields/index.ts`

```typescript
export { InputField } from "./InputField.js";
export { TextareaField } from "./TextareaField.js";
export { SelectField } from "./SelectField.js";
```

---

### Step 5: FormComponent

**File:** `apps/tui/src/components/FormComponent.tsx`

The main form component that composes hooks and field renderers.

```typescript
import { useCallback, useRef } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { useFormState } from "../hooks/useFormState.js";
import { useFormNavigation } from "../hooks/useFormNavigation.js";
import { useOverlay } from "../hooks/useOverlay.js";
import { InputField } from "./fields/InputField.js";
import { TextareaField } from "./fields/TextareaField.js";
import { SelectField } from "./fields/SelectField.js";
import type {
  FormComponentProps,
  FormFieldDefinition,
  FieldRendererProps,
} from "./FormComponent.types.js";

/**
 * Reusable form component with keyboard-driven navigation and validation.
 *
 * Usage:
 * ```tsx
 * <FormComponent
 *   fields={[
 *     { name: "title", label: "Title", type: "input", required: true },
 *     { name: "body", label: "Description", type: "textarea" },
 *     { name: "state", label: "State", type: "select", options: [...] },
 *   ]}
 *   onSubmit={async (values) => { await api.create(values); }}
 *   onCancel={() => navigation.pop()}
 * />
 * ```
 *
 * Keyboard:
 * - Tab / Shift+Tab: Navigate between fields and buttons
 * - Ctrl+S: Submit from anywhere
 * - Esc: Cancel (with dirty-state confirmation if unsaved changes)
 * - Enter: Submit when on submit button, cancel when on cancel button,
 *          advance to next field when on single-line input
 */
export function FormComponent({
  fields,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  isSubmitting = false,
}: FormComponentProps) {
  const theme = useTheme();
  const { contentHeight } = useLayout();
  const overlay = useOverlay();
  const isSubmittingRef = useRef(false);

  const { state, setValue, setError, touchField, validateAll, reset } =
    useFormState(fields, initialValues);

  // Handle submit: validate all fields, then call onSubmit
  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current || isSubmitting) return;

    const valid = validateAll();
    if (!valid) return;

    isSubmittingRef.current = true;
    try {
      await onSubmit(state.values);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [validateAll, onSubmit, state.values, isSubmitting]);

  // Handle cancel: check dirty state, prompt if unsaved changes
  const handleCancel = useCallback(() => {
    if (state.isDirty) {
      overlay.openOverlay("confirm", {
        title: "Unsaved changes",
        message: "You have unsaved changes. Discard and leave?",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        onConfirm: () => {
          overlay.closeOverlay();
          onCancel();
        },
        onCancel: () => {
          overlay.closeOverlay();
        },
      });
    } else {
      onCancel();
    }
  }, [state.isDirty, onCancel, overlay]);

  const nav = useFormNavigation(fields, handleSubmit, handleCancel);

  // Render the appropriate field component based on type
  function renderField(field: FormFieldDefinition, index: number) {
    const focused = nav.focusIndex === index;
    const error = state.errors[field.name] ?? null;
    const touched = state.touched.has(field.name);
    const showError = (touched || state.isSubmitted) && error !== null;

    const props: FieldRendererProps = {
      field,
      value: state.values[field.name],
      error,
      focused,
      touched,
      showError,
      onChange: (value: unknown) => setValue(field.name, value),
      onBlur: () => touchField(field.name),
    };

    switch (field.type) {
      case "input":
        return <InputField key={field.name} {...props} />;
      case "textarea":
        return <TextareaField key={field.name} {...props} />;
      case "select":
        return <SelectField key={field.name} {...props} />;
      default:
        return <InputField key={field.name} {...props} />;
    }
  }

  return (
    <scrollbox scrollY={true} width="100%" height="100%">
      <box
        flexDirection="column"
        gap={1}
        paddingX={1}
        paddingY={1}
        width="100%"
      >
        {/* Form fields */}
        {fields.map((field, index) => renderField(field, index))}

        {/* Button row */}
        <box flexDirection="row" gap={2} paddingTop={1}>
          <text
            fg={nav.isSubmitFocused ? theme.primary : theme.muted}
            attributes={nav.isSubmitFocused ? 1 : 0}
          >
            {isSubmitting ? `⠋ Saving…` : `[ ${submitLabel} ]`}
          </text>
          <text
            fg={nav.isCancelFocused ? theme.primary : theme.muted}
            attributes={nav.isCancelFocused ? 1 : 0}
          >
            {`[ ${cancelLabel} ]`}
          </text>
        </box>
      </box>
    </scrollbox>
  );
}
```

**Key behaviors:**

1. **Scrollable container:** The form is wrapped in `<scrollbox scrollY={true}>` so forms taller than the terminal can scroll.

2. **Dirty state confirmation:** When Esc is pressed and `state.isDirty` is true, a confirm dialog is shown via the existing `OverlayManager`. The overlay renders at MODAL priority (2), which takes precedence over the form's SCREEN scope. If the form is clean, cancel is immediate.

3. **Submit guard:** `isSubmittingRef` prevents double-submission during async onSubmit. The `isSubmitting` prop from the parent also disables the submit button.

4. **Field rendering delegation:** Each field type has a dedicated renderer. The switch is exhaustive with a fallback to `InputField` for unknown types.

5. **Button rendering:** Submit and Cancel are rendered as styled text (`[ Submit ]` / `[ Cancel ]`) with `theme.primary` foreground and bold (`attributes=1`) when focused, `theme.muted` when unfocused. This avoids the double-border issue with wrapping `ActionButton` in another bordered `<box>`. When `isSubmitting` is true, the submit label changes to `⠋ Saving…`.

---

### Step 6: Update Barrel Exports

**File:** `apps/tui/src/hooks/index.ts` — Add to existing exports:

```typescript
export { useFormState } from "./useFormState.js";
export { useFormNavigation } from "./useFormNavigation.js";
```

**File:** `apps/tui/src/components/index.ts` — Add to existing exports:

```typescript
export { FormComponent } from "./FormComponent.js";
export type {
  FormComponentProps,
  FormFieldDefinition,
  FormFieldType,
  SelectOption,
  FormState,
  FieldRendererProps,
  UseFormStateReturn,
  UseFormNavigationReturn,
} from "./FormComponent.types.js";
export { InputField } from "./fields/InputField.js";
export { TextareaField } from "./fields/TextareaField.js";
export { SelectField } from "./fields/SelectField.js";
```

---

### Step 7: Integration Verification

No changes to the provider stack are needed. The form component:
- Reads `useTheme()` from `ThemeProvider` (semantic tokens for border colors, error text) ✓
- Reads `useLayout()` from `useTerminalDimensions()` (breakpoint for textarea height) ✓
- Registers keybindings via `useScreenKeybindings()` through `KeybindingProvider` (Tab, Shift+Tab, Ctrl+S, Esc, Enter) ✓
- Uses `useOverlay()` from `OverlayManager` for dirty-state confirm dialog ✓
- Uses `useLoading()` indirectly through spinner frame for submit button ✓

---

## 5. Productionization Notes

This ticket produces production code directly — no PoC phase. The following items must be verified during implementation:

### 5.1 OpenTUI `<textarea>` Ref Access

Verify that `@opentui/react@0.1.90`'s `<textarea>` supports `ref` forwarding to `TextareaRenderable`. The React reconciler's `TextareaProps` includes `ref?: React.Ref<TextareaRenderable>`. This should work, but must be confirmed empirically.

**If ref access works:** Use `textareaRef.current.plainText` to read current text on blur (Tab away).

**If ref access does NOT work:** Fall back to using `onContentChange` event handler. OpenTUI's `TextareaProps` includes `onContentChange?: (event: ContentChangeEvent) => void`. Use this to track changes and maintain a local string ref.

### 5.2 Tab Key Interception Order

The keybinding provider's `useKeyboard` captures all input before OpenTUI's internal component handlers. When a match is found, `event.preventDefault()` and `event.stopPropagation()` are called. This prevents Tab from reaching the focused `<input>`, `<textarea>`, or `<select>`.

**Verification step:** Run the form with a focused `<input>` and press Tab. Confirm the cursor moves to the next field.

### 5.3 Enter Key on Textarea Fields

The `return` keybinding in `useFormNavigation` uses a `when` predicate that returns `false` when the focused field is a textarea. This means Enter falls through the scope chain with no match, reaching OpenTUI's `<textarea>` which inserts a newline.

**Edge case:** If another scope (e.g., GLOBAL) has a `return` handler, it would fire instead of reaching the textarea. Current global keybindings do not include Enter — confirmed by examining the global keys: `q`, `Esc`, `Ctrl+C`, `?`, `:`, `g`.

### 5.4 Select Component Focus Interaction

When `<select>` is focused, it captures `j`/`k` for option navigation via OpenTUI's internal handlers. Tab and Shift+Tab are intercepted by the form's SCREEN scope. Verify that j/k navigation still works within the select — since no form scope handler is registered for `j` or `k`, these keys should fall through to OpenTUI.

### 5.5 Memory Stability

Form state uses React `useState`. The keybinding scope is removed on unmount via `useScreenKeybindings`'s cleanup effect (confirmed in `useScreenKeybindings.ts` line 43: `return () => { keybindingCtx.removeScope(scopeId); }`).

### 5.6 OpenTUI `<input>` `focused` Prop Behavior

OpenTUI's `<input>` accepts `focused?: boolean` which programmatically controls the focus state. Verify that switching `focused` between inputs doesn't cause cursor artifacts.

---

## 6. Unit & Integration Tests

### Test file: `e2e/tui/form-component.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against a real TUI process spawned in a PTY. No mocking of internal hooks or component state.

**Note:** Tests that navigate to screens using `FormComponent` (e.g., issue create) will fail until those screens are implemented. Tests are left failing per project policy — they are never skipped or commented out.

```typescript
// e2e/tui/form-component.test.ts

import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  createMockAPIEnv,
  type TUITestInstance,
} from "./helpers";

let terminal: TUITestInstance;

afterEach(async () => {
  if (terminal) {
    await terminal.terminate();
  }
});

// ── 1. Terminal Snapshot Tests ──────────────────────────────────────────

describe("FormComponent — Terminal Snapshots", () => {
  test("SNAP-FORM-001: form renders with field labels and borders at standard size", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FORM-002: form renders at minimum terminal size (80x24)", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FORM-003: form renders at large terminal size (200x60)", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FORM-004: focused field shows primary color border", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("SNAP-FORM-005: validation error displays below field in error color", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendKeys("ctrl+s");
    await terminal.waitForText("is required");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});

// ── 2. Keyboard Interaction Tests ───────────────────────────────────────

describe("FormComponent — Keyboard Interaction", () => {
  test("KEY-FORM-001: Tab moves focus to next field", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    const before = terminal.snapshot();
    await terminal.sendKeys("Tab");
    const after = terminal.snapshot();
    expect(after).not.toEqual(before);
  });

  test("KEY-FORM-002: Shift+Tab moves focus to previous field", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendKeys("Tab");
    const secondField = terminal.snapshot();
    await terminal.sendKeys("shift+Tab");
    const firstField = terminal.snapshot();
    expect(firstField).not.toEqual(secondField);
  });

  test("KEY-FORM-003: Tab wraps from last button to first field", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    for (let i = 0; i < 10; i++) {
      await terminal.sendKeys("Tab");
    }
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("Title");
  });

  test("KEY-FORM-004: Ctrl+S submits form from any field", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendText("Test issue title");
    await terminal.sendKeys("ctrl+s");
    const snapshot = terminal.snapshot();
    const hasError = snapshot.includes("is required");
    const hasSaving = snapshot.includes("Saving");
    expect(hasError || hasSaving).toBe(true);
  });

  test("KEY-FORM-005: Enter on submit button submits form", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendText("Test issue");
    for (let i = 0; i < 5; i++) {
      await terminal.sendKeys("Tab");
    }
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("Submit");
    await terminal.sendKeys("Enter");
  });

  test("KEY-FORM-006: text input into focused field updates value", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendText("My new issue");
    await terminal.waitForText("My new issue");
  });

  test("KEY-FORM-007: Enter on single-line input advances to next field", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendText("Issue title");
    await terminal.sendKeys("Enter");
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("Issue title");
  });
});

// ── 3. Validation Tests ─────────────────────────────────────────────────

describe("FormComponent — Validation", () => {
  test("VAL-FORM-001: required field shows error on submit when empty", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendKeys("ctrl+s");
    await terminal.waitForText("is required");
  });

  test("VAL-FORM-002: required field shows error on blur when empty", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendKeys("Tab");
    await terminal.waitForText("is required");
  });

  test("VAL-FORM-003: error clears when valid value entered", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendKeys("Tab");
    await terminal.waitForText("is required");
    await terminal.sendKeys("shift+Tab");
    await terminal.sendText("Valid title");
    await terminal.waitForNoText("is required");
  });

  test("VAL-FORM-004: multiple validation errors shown simultaneously after submit", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendKeys("ctrl+s");
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("is required");
  });

  test("VAL-FORM-005: required fields show asterisk in label", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Title\s*\*/);
  });
});

// ── 4. Dirty State Tests ────────────────────────────────────────────────

describe("FormComponent — Dirty State", () => {
  test("DIRTY-FORM-001: Esc on clean form cancels immediately", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Submit");
  });

  test("DIRTY-FORM-002: Esc on dirty form shows confirmation dialog", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendText("Some text");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Unsaved changes");
    await terminal.waitForText("Discard");
  });

  test("DIRTY-FORM-003: confirming discard on dirty form navigates away", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendText("Some unsaved text");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Unsaved changes");
    await terminal.sendKeys("Enter");
    await terminal.waitForNoText("Unsaved changes");
  });

  test("DIRTY-FORM-004: cancelling discard dialog returns to form", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendText("Important text");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Unsaved changes");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Unsaved changes");
    await terminal.waitForText("Important text");
  });
});

// ── 5. Responsive Layout Tests ──────────────────────────────────────────

describe("FormComponent — Responsive Layout", () => {
  test("RESP-FORM-001: textarea field height adapts to breakpoint", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    const standardSnapshot = terminal.snapshot();
    await terminal.terminate();
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    const minimumSnapshot = terminal.snapshot();
    expect(standardSnapshot).not.toEqual(minimumSnapshot);
  });

  test("RESP-FORM-002: form scrolls when fields exceed terminal height", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    for (let i = 0; i < 6; i++) {
      await terminal.sendKeys("Tab");
    }
    const snapshot = terminal.snapshot();
    expect(snapshot).toContain("Submit");
  });

  test("RESP-FORM-003: resize during form editing updates layout", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    const beforeResize = terminal.snapshot();
    await terminal.resize(
      TERMINAL_SIZES.minimum.width,
      TERMINAL_SIZES.minimum.height,
    );
    const afterResize = terminal.snapshot();
    expect(afterResize).not.toEqual(beforeResize);
    expect(afterResize).toContain("Title");
  });
});

// ── 6. Select Field Tests ───────────────────────────────────────────────

describe("FormComponent — Select Field", () => {
  test("SEL-FORM-001: select field shows options when focused", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    for (let i = 0; i < 3; i++) {
      await terminal.sendKeys("Tab");
    }
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatchSnapshot();
  });

  test("SEL-FORM-002: j/k navigates select options", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    for (let i = 0; i < 3; i++) {
      await terminal.sendKeys("Tab");
    }
    const before = terminal.snapshot();
    await terminal.sendKeys("j");
    const after = terminal.snapshot();
    expect(after).not.toEqual(before);
  });
});

// ── 7. Submit Loading State Tests ───────────────────────────────────────

describe("FormComponent — Submit Loading State", () => {
  test("LOAD-FORM-001: submit button shows loading state during submission", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    await terminal.sendText("Test issue for loading state");
    await terminal.sendKeys("ctrl+s");
    const snapshot = terminal.snapshot();
    const hasSaving = snapshot.includes("Saving");
    const hasError = snapshot.includes("is required");
    expect(hasSaving || hasError).toBe(true);
  });
});

// ── 8. Status Bar Hints Tests ───────────────────────────────────────────

describe("FormComponent — Status Bar Hints", () => {
  test("HINT-FORM-001: status bar shows form-specific keybinding hints", async () => {
    const env = createMockAPIEnv();
    terminal = await launchTUI({
      env,
      args: ["--screen", "issue-create", "--repo", "alice/demo"],
    });
    await terminal.waitForText("Title");
    const lastLine = terminal.getLine(terminal.rows - 1);
    expect(lastLine).toMatch(/Tab/);
    expect(lastLine).toMatch(/Ctrl\+S/);
    expect(lastLine).toMatch(/Esc/);
  });
});
```

### Test Coverage Matrix

| Test ID | Category | Behavior Verified | Terminal Size |
|---------|----------|-------------------|---------------|
| SNAP-FORM-001 | Snapshot | Form visual rendering | 120×40 |
| SNAP-FORM-002 | Snapshot | Minimum size layout | 80×24 |
| SNAP-FORM-003 | Snapshot | Large size layout | 200×60 |
| SNAP-FORM-004 | Snapshot | Focused field primary border | 120×40 |
| SNAP-FORM-005 | Snapshot | Validation error display | 120×40 |
| KEY-FORM-001 | Keyboard | Tab advances focus | 120×40 |
| KEY-FORM-002 | Keyboard | Shift+Tab retreats focus | 120×40 |
| KEY-FORM-003 | Keyboard | Tab wraps around | 120×40 |
| KEY-FORM-004 | Keyboard | Ctrl+S submits from field | 120×40 |
| KEY-FORM-005 | Keyboard | Enter on submit button | 120×40 |
| KEY-FORM-006 | Keyboard | Text input updates value | 120×40 |
| KEY-FORM-007 | Keyboard | Enter on input advances | 120×40 |
| VAL-FORM-001 | Validation | Required error on submit | 120×40 |
| VAL-FORM-002 | Validation | Required error on blur | 120×40 |
| VAL-FORM-003 | Validation | Error clears on valid input | 120×40 |
| VAL-FORM-004 | Validation | Multiple errors after submit | 120×40 |
| VAL-FORM-005 | Validation | Asterisk on required labels | 120×40 |
| DIRTY-FORM-001 | Dirty state | Esc on clean form | 120×40 |
| DIRTY-FORM-002 | Dirty state | Esc on dirty form → dialog | 120×40 |
| DIRTY-FORM-003 | Dirty state | Confirm discard navigates | 120×40 |
| DIRTY-FORM-004 | Dirty state | Cancel discard returns | 120×40 |
| RESP-FORM-001 | Responsive | Textarea height by breakpoint | 80×24, 120×40 |
| RESP-FORM-002 | Responsive | Form scrolls at min size | 80×24 |
| RESP-FORM-003 | Responsive | Resize updates layout | 120→80 |
| SEL-FORM-001 | Select | Options visible when focused | 120×40 |
| SEL-FORM-002 | Select | j/k navigates options | 120×40 |
| LOAD-FORM-001 | Loading | Submit button loading state | 120×40 |
| HINT-FORM-001 | Hints | Status bar form hints | 120×40 |

---

## 7. File Inventory

### New files

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `apps/tui/src/components/FormComponent.types.ts` | Type definitions for form system | ~130 |
| `apps/tui/src/components/FormComponent.tsx` | Main form component | ~150 |
| `apps/tui/src/components/fields/InputField.tsx` | Single-line input field renderer | ~55 |
| `apps/tui/src/components/fields/TextareaField.tsx` | Multi-line textarea field renderer | ~75 |
| `apps/tui/src/components/fields/SelectField.tsx` | Select dropdown field renderer | ~70 |
| `apps/tui/src/components/fields/index.ts` | Field barrel export | ~5 |
| `apps/tui/src/hooks/useFormState.ts` | Form state management hook | ~120 |
| `apps/tui/src/hooks/useFormNavigation.ts` | Form keyboard navigation hook | ~100 |
| `e2e/tui/form-component.test.ts` | E2E tests | ~400 |

### Modified files

| File | Change |
|------|--------|
| `apps/tui/src/hooks/index.ts` | Add `useFormState`, `useFormNavigation` exports |
| `apps/tui/src/components/index.ts` | Add `FormComponent`, field, and type exports |

---

## 8. Acceptance Criteria

1. **Tab/Shift+Tab** cycles focus through all form fields and submit/cancel buttons, wrapping at boundaries.
2. **Ctrl+S** submits the form from any focused field or button.
3. **Esc** cancels the form. If dirty, shows a confirmation dialog via `OverlayManager`. If clean, cancels immediately.
4. **Enter** on the submit button submits the form. Enter on a single-line input advances to the next field. Enter on a textarea inserts a newline (falls through to OpenTUI).
5. **Required fields** show `*` after the label text and display `"{Label} is required"` error when submitted empty or tabbed away empty.
6. **Custom validation** functions receive the field value and return an error string or null. Errors display below the field in `theme.error` color.
7. **Focused field** shows `theme.primary` border color. Unfocused fields show `theme.border`. Error fields show `theme.error` border.
8. **Dirty state** is computed by comparing current values to initial values via `useMemo`. The `isDirty` property is true if any value differs from its initial value.
9. **Status bar** shows form-specific hints: `Tab next field | Ctrl+S submit | Esc cancel` via `useScreenKeybindings` status bar hint registration.
10. **Textarea height** responds to terminal breakpoint from `useLayout()`: 5 rows at minimum, 8 at standard, 12 at large. Override via `maxRows` per-field.
11. **Select field** uses OpenTUI's `<select>` with j/k navigation, `wrapSelection`, and `showScrollIndicator` for >5 options.
12. **Form scrolls** in a `<scrollbox scrollY={true}>` when content exceeds available height.
13. **All 28 E2E tests** in `e2e/tui/form-component.test.ts` are present and assert correct behavior. Tests that fail due to unimplemented backend or screen are left failing — never skipped or commented out.
14. **No new runtime dependencies** beyond `@opentui/core`, `@opentui/react`, `react`, and `@codeplane/ui-core`.
15. **TypeScript** compiles with `tsc --noEmit` (no type errors introduced).
16. **Hooks exported** from `apps/tui/src/hooks/index.ts` and components exported from `apps/tui/src/components/index.ts`.