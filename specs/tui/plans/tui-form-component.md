# Implementation Plan: TUI Form Component

This document outlines the step-by-step implementation for the reusable `FormComponent` in the Codeplane TUI, incorporating the provided engineering specification and the architectural findings regarding OpenTUI's React reconciler.

## Phase 1: Type Definitions

**1. Create `apps/tui/src/components/FormComponent.types.ts`**
- Define `FormFieldType` (`"input" | "textarea" | "select"`).
- Define `SelectOption` interface.
- Define `FormFieldDefinition` specifying `name`, `label`, `type`, `required`, `placeholder`, `validation`, `options`, and `maxRows`.
- Define `FormComponentProps` ensuring callbacks (`onSubmit`, `onCancel`) and configuration are typed properly.
- Define `FormState`, `UseFormStateReturn`, and `UseFormNavigationReturn`.
- Define `FieldRendererProps` for individual input components.

## Phase 2: State and Navigation Hooks

**1. Create `apps/tui/src/hooks/useFormState.ts`**
- Implement `useFormState` to manage pure state tracking for values, errors, touched fields, and submission status.
- Derive default values based on the field definitions (e.g., fallback to the first option for `select` types).
- Implement validation logic that runs on field blur (`touchField`) and global submission (`validateAll`).
- Calculate `isDirty` dynamically by comparing current state values with initial frozen values (using `useRef`).

**2. Create `apps/tui/src/hooks/useFormNavigation.ts`**
- Implement `useFormNavigation` to manage `focusIndex`.
- Support wrapping navigation for fields and standard form action buttons (Submit, Cancel).
- Inject `useScreenKeybindings` at `PRIORITY.SCREEN` to capture `Tab`, `Shift+Tab`, `Ctrl+S`, `Escape`, and `Return`.
- Include appropriate `when` conditions for `Return` so it safely passes through for multiline input where necessary or triggers `focusNext` on standard text fields.
- Provide `StatusBarHint` definitions mapped to the bound shortcuts.

## Phase 3: Field Renderers

**1. Create `apps/tui/src/components/fields/InputField.tsx`**
- Implement a fixed-height `<box>` (height: 3) wrapping an OpenTUI `<input>` component.
- Configure dynamic border and label colors using `useTheme` based on focus and error states.
- Render error messages beneath the input conditionally if `showError` is true.

**2. Create `apps/tui/src/components/fields/TextareaField.tsx`**
- *Note from Research Findings*: Although `@opentui/react` exposes `<textarea>`, its `TextareaProps` omit explicit types for `onInput` and `onChange`. Therefore, we will use an OpenTUI `<input>` constrained within a dynamically calculated box height to achieve robust multiline behavior without type casting hacks.
- Use `useLayout` to establish breakpoints mapping box height: 5 rows (minimum/null breakpoint), 8 rows (standard), 12 rows (large) unless overridden by `field.maxRows`.

**3. Create `apps/tui/src/components/fields/SelectField.tsx`**
- Wrap OpenTUI's `<select>` component in a dynamic-height `<box>`.
- Allow up to 5 items to be visible before enforcing scrolling via `showScrollIndicator={true}`.
- Ensure `focused` props successfully delegate internally, letting `<select>` natively manage `j` / `k` options browsing.

**4. Create `apps/tui/src/components/fields/index.ts`**
- Add barrel exports for `InputField`, `TextareaField`, and `SelectField`.

## Phase 4: Main Component Assembly

**1. Create `apps/tui/src/components/FormComponent.tsx`**
- Compose the `useFormState` and `useFormNavigation` hooks.
- Map over `fields` to dynamically render `InputField`, `TextareaField`, or `SelectField` components while propagating standard `FieldRendererProps`.
- Integrate `useOverlay` to render a confirmation dialog when `onCancel` is fired and `isDirty` is true.
- Include the `ActionButton` logic for Submission, honoring double-submission guards with an `isSubmitting` Ref.
- Wrap the entire structure in an active OpenTUI `<scrollbox>`.

## Phase 5: Export Wiring

**1. Update `apps/tui/src/hooks/index.ts`**
- Append exports for `useFormState`, `useFormNavigation` and their related return types.

**2. Update/Create `apps/tui/src/components/index.ts`**
- Export `FormComponent` and its primary definitions (`FormComponentProps`, `FormFieldDefinition`, `FormFieldType`, `SelectOption`).
- Export the internal field components for optional usage elsewhere.

## Phase 6: E2E Tests Validation

**1. Create `e2e/tui/form-component.test.ts`**
- Construct the testing suite invoking `@microsoft/tui-test` via the local `launchTUI` infrastructure.
- Implement terminal snapshot tests mapping 120x40, 80x24, and 200x60 dimensions (e.g., `SNAP-FORM-001`, `SNAP-FORM-002`, `SNAP-FORM-003`).
- Implement validation tests ensuring empty required fields immediately fire `"{Label} is required"` upon `ctrl+s`.
- Implement keyboard interaction tests ensuring `Tab`/`Shift+Tab` cycling properly cycles the form elements up and down.
- Implement dirty state tests mapping the `Escape` key workflow ensuring the confirmation dialog invokes successfully.
- Add resizing tests confirming that OpenTUI's underlying `<scrollbox>` container successfully preserves state and responds visually when resized between standard and minimum breakpoints.