import React from "react";
import type { ScreenComponentProps } from "../router/types.js";

export function PlaceholderScreen({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>{entry.screen}</text>
      <text color="gray">This screen is not yet implemented.</text>
      {paramEntries.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          <text underline>Params:</text>
          {paramEntries.map(([key, value]) => (
            <text key={key}>
              {`  ${key}: ${value}`}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}
