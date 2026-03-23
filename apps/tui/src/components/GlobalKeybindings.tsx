import { useKeyboard } from "@opentui/react";
import { useNavigation } from "../hooks/useNavigation.js";
import { goToBindings } from "../navigation/goToBindings.js";
import { useState, useRef, useCallback } from "react";
import { useLoading } from "../hooks/useLoading.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const { retryCallback } = useLoading();
  const [goToMode, setGoToMode] = useState(false);
  const goToTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKey = useCallback((event: { name: string; ctrl?: boolean; shift?: boolean }) => {
    if (event.name === "c" && event.ctrl) {
      process.exit(0);
    }

    if (event.name === "r" && event.shift) {
      if (retryCallback) {
        retryCallback();
      }
      return;
    }

    if (event.name === "R") {
      if (retryCallback) {
        retryCallback();
      }
      return;
    }

    if (goToMode) {
      setGoToMode(false);
      if (goToTimeout.current) clearTimeout(goToTimeout.current);
      const binding = goToBindings[event.name as keyof typeof goToBindings];
      if (binding) {
        const params = nav.current.params;
        nav.reset(binding.screen, binding.requiresRepo ? params : undefined);
      }
      return;
    }

    if (event.name === "g") {
      setGoToMode(true);
      goToTimeout.current = setTimeout(() => setGoToMode(false), 1500);
      return;
    }

    if (event.name === "q") {
      if (nav.canPop()) {
        nav.pop();
      } else {
        process.exit(0);
      }
      return;
    }

    if (event.name === "escape") {
      if (nav.canPop()) {
        nav.pop();
      } else {
        process.exit(0);
      }
      return;
    }
  }, [goToMode, nav]);

  useKeyboard(handleKey);

  return <>{children}</>;
}
