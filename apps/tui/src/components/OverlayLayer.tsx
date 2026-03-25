import React from "react";
import { useOverlay } from "../hooks/useOverlay.js";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";

/**
 * Overlay rendering layer.
 *
 * Renders an absolutely-positioned <box> with zIndex when an overlay
 * is active. The box uses responsive sizing from useLayout() and
 * semantic colors from useTheme().
 *
 * Content for each overlay type is rendered by child components:
 * - "help": <HelpOverlayContent /> (implemented in a separate ticket)
 * - "command-palette": <CommandPaletteContent /> (implemented in a separate ticket)
 * - "confirm": <ConfirmDialogContent /> (implemented in a separate ticket)
 *
 * Until those components are implemented, the OverlayLayer renders
 * placeholder text indicating which overlay is active.
 */
export function OverlayLayer() {
  const { activeOverlay, confirmPayload } = useOverlay();
  const layout = useLayout();
  const theme = useTheme();

  if (activeOverlay === null) return null;

  // Responsive sizing from layout context
  const width = layout.modalWidth;
  const height = layout.modalHeight;

  // Determine overlay title for placeholder rendering
  const titleMap: Record<string, string> = {
    "help": "Keybindings",
    "command-palette": "Command Palette",
    "confirm": confirmPayload?.title ?? "Confirm",
  };
  const title = titleMap[activeOverlay] ?? activeOverlay;

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={100}
      justifyContent="center"
      alignItems="center"
    >
      <box
        width={width}
        height={height}
        flexDirection="column"
        border={true}
        borderColor={theme.border}
        backgroundColor={theme.surface}
        padding={1}
      >
        {/* Title bar */}
        <box flexDirection="row" width="100%">
          <text fg={theme.primary}>
            {title}
          </text>
          <box flexGrow={1} />
          <text fg={theme.muted}>
            Esc close
          </text>
        </box>

        {/* Separator */}
        <text fg={theme.border}>
          {"─".repeat(40)}
        </text>

        {/* Content area — placeholder until overlay content components land */}
        <box flexGrow={1} flexDirection="column">
          {activeOverlay === "help" && (
            <text fg={theme.muted}>[Help overlay content — pending TUI_HELP_OVERLAY implementation]</text>
          )}
          {activeOverlay === "command-palette" && (
            <text fg={theme.muted}>[Command palette content — pending TUI_COMMAND_PALETTE implementation]</text>
          )}
          {activeOverlay === "confirm" && confirmPayload && (
            <box flexDirection="column" gap={1}>
              <text>{confirmPayload.message}</text>
              <box flexDirection="row" gap={2}>
                <text fg={theme.error}>[{confirmPayload.confirmLabel ?? "Confirm"}]</text>
                <text fg={theme.muted}>[{confirmPayload.cancelLabel ?? "Cancel"}]</text>
              </box>
            </box>
          )}
        </box>
      </box>
    </box>
  );
}
