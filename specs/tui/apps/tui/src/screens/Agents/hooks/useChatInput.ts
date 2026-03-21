import { useState, useCallback, useMemo } from "react";
import type { Breakpoint } from "../types.js";

export interface ChatInputState {
  text: string;
  setText: (text: string) => void;
  isFocused: boolean;
  setFocused: (focused: boolean) => void;
  isMultiline: boolean;
  setMultiline: (multiline: boolean) => void;
  inputHeight: number; // 1 for single-line, up to maxLines
  maxLength: number; // 4000
  clear: () => void;
  insertNewline: () => void;
}

export function useChatInput(breakpoint: Breakpoint): ChatInputState {
  const [text, setTextState] = useState("");
  const [isFocused, setFocused] = useState(false);
  const [isMultiline, setMultiline] = useState(false);

  const maxLength = 4000;

  const setText = useCallback(
    (newText: string) => {
      if (newText.length > maxLength) {
        setTextState(newText.slice(0, maxLength));
      } else {
        setTextState(newText);
      }
    },
    [maxLength]
  );

  const clear = useCallback(() => {
    setTextState("");
    setMultiline(false);
  }, []);

  const insertNewline = useCallback(() => {
    setMultiline(true);
    setTextState((prev) => {
      if (prev.length < maxLength) {
        return prev + "\n";
      }
      return prev;
    });
  }, [maxLength]);

  const inputHeight = useMemo(() => {
    if (!isMultiline) return 1;
    const lines = text.split("\n").length;
    if (breakpoint === "minimum") return 1;
    if (breakpoint === "standard") return Math.min(lines, 4);
    return Math.min(lines, 8); // large
  }, [text, isMultiline, breakpoint]);

  return {
    text,
    setText,
    isFocused,
    setFocused,
    isMultiline,
    setMultiline,
    inputHeight,
    maxLength,
    clear,
    insertNewline,
  };
}
