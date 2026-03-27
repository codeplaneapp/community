import { useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { isUnicodeSupported } from "../theme/detect.js";
import { SKELETON_BLOCK_CHAR, SKELETON_DASH_CHAR } from "../loading/constants.js";

interface SkeletonDetailProps {
  /** Section headers to show (e.g., ["Description", "Comments"]). */
  sections?: string[];
}

/**
 * Skeleton placeholder for detail views.
 *
 * Shows section headers with placeholder body blocks.
 * Section headers are real text; body content is block characters.
 */
export function SkeletonDetail({
  sections = ["Description", "Comments"],
}: SkeletonDetailProps) {
  const { width, contentHeight } = useLayout();
  const theme = useTheme();
  const unicode = isUnicodeSupported();
  const blockChar = unicode ? SKELETON_BLOCK_CHAR : SKELETON_DASH_CHAR;

  const bodyRows = useMemo(() => {
    const availableWidth = Math.max(10, width - 6);
    // 3 placeholder lines per section
    const result: number[][] = [];
    for (let s = 0; s < sections.length; s++) {
      const sectionRows: number[] = [];
      for (let r = 0; r < 3; r++) {
        const fraction = 0.5 + ((((s * 5 + r * 7 + 2) * 11) % 40) / 100);
        sectionRows.push(
          Math.max(3, Math.floor(availableWidth * fraction))
        );
      }
      result.push(sectionRows);
    }
    return result;
  }, [width, sections.length]);

  return (
    <box flexDirection="column" width="100%" padding={1} gap={1}>
      {/* Title skeleton */}
      <text fg={theme.muted} attributes={1}>
        {blockChar.repeat(Math.min(30, Math.floor((width - 4) * 0.6)))}
      </text>

      {sections.map((header, si) => (
        <box key={si} flexDirection="column" gap={0}>
          <text fg={theme.muted} attributes={1}>
            {header}
          </text>
          {bodyRows[si]?.map((rowWidth, ri) => (
            <box key={ri} paddingX={1}>
              <text fg={theme.muted}>{blockChar.repeat(rowWidth)}</text>
            </box>
          ))}
        </box>
      ))}
    </box>
  );
}
