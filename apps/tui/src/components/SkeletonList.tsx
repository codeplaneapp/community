import { useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { isUnicodeSupported } from "../theme/detect.js";
import { SKELETON_BLOCK_CHAR, SKELETON_DASH_CHAR } from "../loading/constants.js";
import type { SkeletonRowConfig } from "../loading/types.js";

interface SkeletonListProps {
  /**
   * Number of columns in the list layout.
   * Default: 3 (title, metadata, status)
   */
  columns?: number;
  /** Fixed metadata column width in characters. Default: 6. */
  metaWidth?: number;
  /** Fixed status column width in characters. Default: 5. */
  statusWidth?: number;
}

/**
 * Skeleton placeholder for list views.
 *
 * Renders placeholder rows using muted block characters (▓) at
 * deterministic widths. Row count matches the available content
 * height — no off-screen rendering.
 *
 * Widths are seeded by row index (not random per render) to
 * prevent flicker on re-render or resize.
 */
export function SkeletonList({
  columns = 3,
  metaWidth = 6,
  statusWidth = 5,
}: SkeletonListProps) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();
  const unicode = isUnicodeSupported();
  const blockChar = unicode ? SKELETON_BLOCK_CHAR : SKELETON_DASH_CHAR;

  // Generate deterministic row configs based on row index
  const rows = useMemo(() => {
    const rowCount = Math.max(0, contentHeight);
    const availableWidth = Math.max(10, width - 4); // 2 padding each side
    const titleAvailable = availableWidth - metaWidth - statusWidth - 4; // gaps

    const result: SkeletonRowConfig[] = [];
    for (let i = 0; i < rowCount; i++) {
      // Deterministic width based on row index (40%–90% of available)
      const fraction = 0.4 + ((((i * 7 + 3) * 13) % 50) / 100);
      result.push({
        titleWidth: Math.max(3, Math.floor(titleAvailable * fraction)),
        metaWidth,
        statusWidth,
      });
    }
    return result;
  }, [width, contentHeight, metaWidth, statusWidth]);

  return (
    <box flexDirection="column" width="100%" height={contentHeight}>
      {rows.map((row, i) => (
        <box key={i} flexDirection="row" height={1} paddingX={1}>
          <text fg={theme.muted}>
            {blockChar.repeat(row.titleWidth)}
          </text>
          <box flexGrow={1} />
          {columns >= 2 && (
            <text fg={theme.muted}>
              {blockChar.repeat(row.metaWidth)}
            </text>
          )}
          {columns >= 3 && (
            <>
              <text>  </text>
              <text fg={theme.muted}>
                {blockChar.repeat(row.statusWidth)}
              </text>
            </>
          )}
        </box>
      ))}
    </box>
  );
}
