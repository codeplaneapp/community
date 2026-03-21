import React from "react";
import type { SessionStatusFilter } from "../types.js";
import { STATUS_FILTER_LABELS } from "../types.js";

interface SessionFilterToolbarProps {
  activeFilter: SessionStatusFilter;
  searchQuery: string;
  isSearchFocused: boolean;
  onSearchChange: (query: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  terminalWidth: number;
}

export function SessionFilterToolbar(props: SessionFilterToolbarProps): React.ReactElement {
  return (
    <box flexDirection="row" width="100%">
      <text>Filter: {STATUS_FILTER_LABELS[props.activeFilter]}</text>
    </box>
  );
}
