import { useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { useNavigation } from "../hooks/useNavigation.js";
import { screenRegistry } from "../navigation/screenRegistry.js";
import { truncateBreadcrumb } from "../util/text.js";

export function HeaderBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();
  const nav = useNavigation();

  const breadcrumbSegments = useMemo(() => {
    return nav.stack.map((entry) => {
      const def = screenRegistry[entry.screen as keyof typeof screenRegistry];
      if (!def) return entry.screen;
      if (typeof def.breadcrumb === "function") {
        return def.breadcrumb(entry.params ?? {});
      }
      return def.breadcrumb;
    });
  }, [nav.stack]);

  const rightWidth = 12;
  const maxBreadcrumbWidth = Math.max(20, width - rightWidth - 2);
  const breadcrumbText = truncateBreadcrumb(breadcrumbSegments, maxBreadcrumbWidth);

  const repoContext = nav.current.params?.owner && nav.current.params?.repo
    ? `${nav.current.params.owner}/${nav.current.params.repo}`
    : "";

  return (
    <box flexDirection="row" height={1} width="100%">
      <box flexGrow={1}>
        <text fg={theme.muted}>{breadcrumbText}</text>
      </box>
      {repoContext && breakpoint !== "minimum" && (
        <box>
          <text fg={theme.muted}>{repoContext}</text>
        </box>
      )}
      <box>
        <text fg={theme.success}> ●</text>
      </box>
    </box>
  );
}
