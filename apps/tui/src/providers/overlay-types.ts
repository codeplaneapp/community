export type OverlayType = "help" | "command-palette" | "confirm";

export type OverlayState = OverlayType | null;

export interface ConfirmPayload {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface OverlayContextType {
  activeOverlay: OverlayState;

  openOverlay(type: "confirm", payload: ConfirmPayload): void;
  openOverlay(type: Exclude<OverlayType, "confirm">): void;
  openOverlay(type: OverlayType, payload?: ConfirmPayload): void;

  closeOverlay(): void;

  isOpen(type: OverlayType): boolean;

  confirmPayload: ConfirmPayload | null;
}
