import React from "react";
import type { AgentSession } from "@codeplane/ui-core";

interface DeleteConfirmationOverlayProps {
  session: AgentSession;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationOverlay({
  session, onConfirm, onCancel,
}: DeleteConfirmationOverlayProps): React.ReactElement {
  const titlePreview = session.title
    ? session.title.slice(0, 40) + (session.title.length > 40 ? "…" : "")
    : "Untitled session";

  return (
    <box position="absolute">
      <text>Delete "{titlePreview}"?</text>
    </box>
  );
}
