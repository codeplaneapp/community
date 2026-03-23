import { useKeyboard } from "@opentui/react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { goToBindings, executeGoTo } from "../navigation/goToBindings.js";
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
      const binding = goToBindings.find(b => b.key === event.name);
      if (binding) {
        const result = executeGoTo(nav, binding, nav.repoContext);
        if (result.error) {
          // Could show error in status bar, for now ignored
        }
      }
      return;
    }

    if (event.name === "g") {
      setGoToMode(true);
      goToTimeout.current = setTimeout(() => setGoToMode(false), 1500);
      return;
    }

    if (event.name === "q") {
      if (nav.canGoBack) {
        nav.pop();
      } else {
        process.exit(0);
      }
      return;
    }

    if (event.name === "escape") {
      if (nav.canGoBack) {
        nav.pop();
      } else {
        process.exit(0);
      }
      return;
    }
  }, [goToMode, nav, retryCallback]);

  useKeyboard(handleKey);

  return <>{children}</>;
}
