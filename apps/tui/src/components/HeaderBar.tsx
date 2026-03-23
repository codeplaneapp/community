import { useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { useNavigation } from "../providers/NavigationProvider.js";
import { truncateBreadcrumb } from "../util/text.js";
import { statusToToken, TextAttributes } from "../theme/tokens.js";

export function HeaderBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();
  const nav = useNavigation();

  const connectionState = "connected"; // placeholder
  const connectionColor = theme[statusToToken(connectionState)];
  const unreadCount = 0; // placeholder

  const breadcrumbSegments = useMemo(() => {
    return nav.stack.map((entry) => entry.breadcrumb);
  }, [nav.stack]);

  const rightWidth = 12;
  const maxBreadcrumbWidth = Math.max(20, width - rightWidth - 2);
  const breadcrumbText = truncateBreadcrumb(breadcrumbSegments, maxBreadcrumbWidth);
  
  const parts = breadcrumbText.split(" › ");
  const currentSegment = parts.pop() || "";
  const breadcrumbPrefix = parts.length > 0 ? parts.join(" › ") + " › " : "";

  const repoContext = nav.repoContext
    ? `${nav.repoContext.owner}/${nav.repoContext.repo}`
    : "";

  return (
    <box flexDirection="row" height={1} width="100%" borderColor={theme.border} border={["bottom"]}>
      <box flexGrow={1}>
        <text fg={theme.muted}>{breadcrumbPrefix}</text>
        <text attributes={TextAttributes.BOLD}>{currentSegment}</text>
      </box>
      {repoContext && breakpoint !== "minimum" && (
        <box>
          <text fg={theme.primary}>{repoContext}</text>
        </box>
      )}
      <box>
        <text fg={connectionColor}> ●</text>
        {unreadCount > 0 && <text fg={theme.primary}> {unreadCount}</text>}
      </box>
    </box>
  );
}
