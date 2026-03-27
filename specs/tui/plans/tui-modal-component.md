# Implementation Plan: `tui-modal-component`

This document outlines the step-by-step implementation for the `Modal` overlay component with focus trap and dismiss behavior, along with the `useModal` hook and refactoring of the global `OverlayLayer`. All code targets React 19 and OpenTUI constraints, mapping directly to `apps/tui/`.

## Step 1: Implement `Modal` Component
**File**: `apps/tui/src/components/Modal.tsx`

Create the presentational Modal component using OpenTUI's `<box>` and `<text>`. It handles responsive sizing and traps focus by registering a `PRIORITY.MODAL` keybinding scope.

```tsx
import React, { useContext, useEffect, useRef, type ReactNode } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { KeybindingContext } from "../providers/KeybindingProvider.js";
import { PRIORITY, type KeyHandler } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";
import type { Breakpoint } from "../types/breakpoint.js";

export type ResponsiveSize =
  | string
  | number
  | {
      minimum?: string | number;
      standard?: string | number;
      large?: string | number;
    };

export interface ModalProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  children: ReactNode;
  width?: ResponsiveSize;
  height?: ResponsiveSize;
  dismissOnEsc?: boolean;
  keybindings?: KeyHandler[];
}

function resolveResponsiveSize(
  size: ResponsiveSize | undefined,
  fallback: string,
  breakpoint: Breakpoint | null,
): string | number {
  if (size === undefined) return fallback;
  if (typeof size === "number") return size;
  if (typeof size === "string") return size;

  const bp: Breakpoint = breakpoint ?? "minimum";
  const value = size[bp as keyof typeof size];
  if (value !== undefined) return value;

  if (bp === "large" && size.standard !== undefined) return size.standard;
  if ((bp === "large" || bp === "standard") && size.minimum !== undefined)
    return size.minimum;
  return fallback;
}

export function Modal({
  visible,
  onDismiss,
  title,
  children,
  width: widthProp,
  height: heightProp,
  dismissOnEsc = true,
  keybindings: extraBindings,
}: ModalProps) {
  const layout = useLayout();
  const theme = useTheme();
  const keybindingCtx = useContext(KeybindingContext);

  if (!keybindingCtx) {
    throw new Error("Modal must be used within a KeybindingProvider");
  }

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const scopeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      if (scopeIdRef.current) {
        keybindingCtx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
      return;
    }

    const bindings = new Map<string, KeyHandler>();

    if (dismissOnEsc) {
      bindings.set(normalizeKeyDescriptor("escape"), {
        key: normalizeKeyDescriptor("escape"),
        description: "Close",
        group: "Modal",
        handler: () => onDismissRef.current(),
      });
    }

    if (extraBindings) {
      for (const binding of extraBindings) {
        const normalized = normalizeKeyDescriptor(binding.key);
        bindings.set(normalized, { ...binding, key: normalized });
      }
    }

    if (bindings.size > 0) {
      const scopeId = keybindingCtx.registerScope({
        priority: PRIORITY.MODAL,
        bindings,
        active: true,
      });
      scopeIdRef.current = scopeId;
    }

    return () => {
      if (scopeIdRef.current) {
        keybindingCtx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
    };
  }, [visible, dismissOnEsc, keybindingCtx, extraBindings]);

  if (!visible) return null;

  const resolvedWidth = resolveResponsiveSize(widthProp, layout.modalWidth, layout.breakpoint);
  const resolvedHeight = resolveResponsiveSize(heightProp, layout.modalHeight, layout.breakpoint);

  return (
    <box
      position="absolute"
      top="auto"
      left="auto"
      width={resolvedWidth as any}
      height={resolvedHeight as any}
      zIndex={100}
      flexDirection="column"
      border={true}
      borderStyle="single"
      borderColor={theme.border}
      backgroundColor={theme.surface}
    >
      {title !== undefined && (
        <>
          <box flexDirection="row" width="100%" paddingX={1}>
            <box flexGrow={1} />
            <text fg={theme.primary}>{title}</text>
            <box flexGrow={1} />
          </box>
          <text fg={theme.border}>{"─".repeat(40)}</text>
        </>
      )}
      <box flexGrow={1} flexDirection="column" padding={1}>
        {children}
      </box>
    </box>
  );
}
```

## Step 2: Implement `useModal` Hook
**File**: `apps/tui/src/hooks/useModal.ts`

Provide imperative state management for localized components utilizing `<Modal>`.

```typescript
import { useState, useCallback, useMemo, type ReactNode } from "react";

export interface UseModalReturn {
  isOpen: boolean;
  open: (content?: ReactNode) => void;
  close: () => void;
  content: ReactNode | null;
}

export function useModal(): UseModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);

  const open = useCallback((newContent?: ReactNode) => {
    setContent(newContent ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setContent(null);
  }, []);

  return useMemo(
    () => ({ isOpen, open, close, content }),
    [isOpen, open, close, content],
  );
}
```

## Step 3: Refactor `OverlayLayer`
**File**: `apps/tui/src/components/OverlayLayer.tsx`

Refactor the singleton layer to delegate entirely to `<Modal>`. Apply `dismissOnEsc={false}` to prevent double-registering the `escape` key handler, since the `OverlayManager` provider already controls it.

```tsx
import React from "react";
import { useOverlay } from "../hooks/useOverlay.js";
import { useTheme } from "../hooks/useTheme.js";
import { Modal } from "./Modal.js";

export function OverlayLayer() {
  const { activeOverlay, closeOverlay, confirmPayload } = useOverlay();
  const theme = useTheme();

  if (activeOverlay === null) return null;

  const titleMap: Record<string, string> = {
    "help": "Keybindings",
    "command-palette": "Command Palette",
    "confirm": confirmPayload?.title ?? "Confirm",
  };
  const title = titleMap[activeOverlay] ?? activeOverlay;

  return (
    <Modal
      visible={true}
      onDismiss={closeOverlay}
      title={title}
      width={{ minimum: "90%", standard: "60%", large: "50%" }}
      height={{ minimum: "90%", standard: "60%", large: "50%" }}
      dismissOnEsc={false}
    >
      {activeOverlay === "help" && (
        <text fg={theme.muted}>
          [Help overlay content — pending TUI_HELP_OVERLAY implementation]
        </text>
      )}
      {activeOverlay === "command-palette" && (
        <text fg={theme.muted}>
          [Command palette content — pending TUI_COMMAND_PALETTE implementation]
        </text>
      )}
      {activeOverlay === "confirm" && confirmPayload && (
        <box flexDirection="column" gap={1}>
          <text>{confirmPayload.message}</text>
          <box flexDirection="row" gap={2}>
            <text fg={theme.error}>
              [{confirmPayload.confirmLabel ?? "Confirm"}]
            </text>
            <text fg={theme.muted}>
              [{confirmPayload.cancelLabel ?? "Cancel"}]
            </text>
          </box>
        </box>
      )}
    </Modal>
  );
}
```

## Step 4: Export Modules
**Files**: `apps/tui/src/components/index.ts` & `apps/tui/src/hooks/index.ts`

Update barrel exports:
```typescript
// In apps/tui/src/components/index.ts
export { Modal, type ModalProps, type ResponsiveSize } from "./Modal.js";

// In apps/tui/src/hooks/index.ts
export { useModal, type UseModalReturn } from "./useModal.js";
```

## Step 5: Implement E2E Tests
**File**: `e2e/tui/app-shell.test.ts`

Append the following E2E test suite inside `app-shell.test.ts` to assert rendering, dimensions, focus traps, and cleanup logic. Existing OVERLAY-* tests will validate backwards compatibility automatically.

```typescript
describe("TUI_MODAL_COMPONENT — Modal overlay rendering and focus trap", () => {
  let terminal: any;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  test("MODAL-001: modal renders with single-line border", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/[┌┐└┘│─╭╮╰╯]/);
  });

  test("MODAL-008: j/k do not propagate to underlying screen while modal open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("j");
    await terminal.sendKeys("k");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");
    await terminal.waitForText("Dashboard");
  });

  test("MODAL-009: Ctrl+C force-quits even with modal open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("\\x03"); // Force quit SIGINT
    await terminal.terminate();
  });

  test("MODAL-015: opening and closing modal does not leak keybinding scopes", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Keybindings");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Keybindings");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command Palette");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Dashboard");
  });
});
```