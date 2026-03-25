import type { ScreenComponentProps } from "../router/types.js";
import { TextAttributes } from "../theme/tokens.js";

export function PlaceholderScreen({ entry }: ScreenComponentProps) {
  const paramEntries = Object.entries(entry.params);

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text attributes={TextAttributes.BOLD}>{entry.screen}</text>
      <text fg="gray">This screen is not yet implemented.</text>
      {paramEntries.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          <text attributes={TextAttributes.UNDERLINE}>Params:</text>
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
