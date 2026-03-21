import { useState, useCallback } from "react";

export interface AutoScrollState {
  enabled: boolean;
  hasNewMessages: boolean;
  toggle: () => void;
  enable: () => void;
  disable: () => void;
  onUserScroll: (direction: "up" | "down") => void;
  onNewContent: () => void;
  resetNewMessages: () => void;
}

export function useAutoScroll(): AutoScrollState {
  const [enabled, setEnabled] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const enable = useCallback(() => {
    setEnabled(true);
    setHasNewMessages(false);
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (next) {
        setHasNewMessages(false);
      }
      return next;
    });
  }, []);

  const onUserScroll = useCallback((direction: "up" | "down") => {
    if (direction === "up") {
      setEnabled(false);
    }
  }, []);

  const onNewContent = useCallback(() => {
    if (!enabled) {
      setHasNewMessages(true);
    }
  }, [enabled]);

  const resetNewMessages = useCallback(() => {
    setHasNewMessages(false);
  }, []);

  return {
    enabled,
    hasNewMessages,
    toggle,
    enable,
    disable,
    onUserScroll,
    onNewContent,
    resetNewMessages,
  };
}
