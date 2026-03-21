export function truncateTitle(
  title: string | null | undefined,
  maxWidth: number,
): { text: string; isMuted: boolean; isItalic: boolean } {
  if (!title || title.trim().length === 0) {
    return { text: "Untitled session", isMuted: true, isItalic: true };
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(title)].map(s => s.segment);
  if (graphemes.length <= maxWidth) {
    return { text: title, isMuted: false, isItalic: false };
  }
  const truncated = graphemes.slice(0, maxWidth - 1).join("") + "…";
  return { text: truncated, isMuted: false, isItalic: false };
}
