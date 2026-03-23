export function truncateBreadcrumb(
  segments: string[],
  maxWidth: number,
  separator = " › "
): string {
  if (segments.length === 0) return "";
  
  const full = segments.join(separator);
  if (full.length <= maxWidth) return full;

  const ellipsis = "…";
  for (let start = 1; start < segments.length; start++) {
    const truncated = ellipsis + separator + segments.slice(start).join(separator);
    if (truncated.length <= maxWidth) return truncated;
  }

  const last = segments[segments.length - 1];
  if (last.length > maxWidth) {
    return last.slice(0, maxWidth - 1) + "…";
  }
  return ellipsis + separator + last;
}

export function truncateRight(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + "…";
}

export function fitWidth(text: string, width: number, align: "left" | "right" = "left"): string {
  if (text.length > width) return truncateRight(text, width);
  if (align === "right") return text.padStart(width);
  return text.padEnd(width);
}

export function truncateText(text: string, maxLength: number): string {
  if (maxLength < 1) return "";
  if (text.length <= maxLength) return text;
  if (maxLength === 1) return "…";
  return text.slice(0, maxLength - 1) + "…";
}

export function wrapText(text: string, width: number): string[] {
  if (width < 1) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= width) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
}
