import type { Breakpoint, SessionListColumn } from "../types.js";

export function getSessionListColumns(
  breakpoint: Breakpoint,
  terminalWidth: number,
): SessionListColumn[] {
  switch (breakpoint) {
    case "minimum": {
      const titleWidth = Math.max(10, terminalWidth - 8);
      return [
        { field: "icon", width: 2, visible: true },
        { field: "idPrefix", width: 0, visible: false },
        { field: "title", width: titleWidth, visible: true },
        { field: "messageCount", width: 0, visible: false },
        { field: "duration", width: 0, visible: false },
        { field: "timestamp", width: 4, visible: true },
      ];
    }
    case "standard":
      return [
        { field: "icon", width: 2, visible: true },
        { field: "idPrefix", width: 0, visible: false },
        { field: "title", width: 40, visible: true },
        { field: "messageCount", width: 8, visible: true },
        { field: "duration", width: 0, visible: false },
        { field: "timestamp", width: 4, visible: true },
      ];
    case "large":
      return [
        { field: "icon", width: 2, visible: true },
        { field: "idPrefix", width: 10, visible: true },
        { field: "title", width: 50, visible: true },
        { field: "messageCount", width: 8, visible: true },
        { field: "duration", width: 8, visible: true },
        { field: "timestamp", width: 6, visible: true },
      ];
  }
}
