import type { JSX } from "react";
import { useNavigation } from "../hooks/useNavigation.js";
import { screenRegistry } from "./registry.js";
import { ScreenName, type ScreenComponentProps } from "./types.js";
import { TextAttributes } from "../theme/tokens.js";

export function ScreenRouter() {
  const { current } = useNavigation();

  const definition = screenRegistry[current.screen as ScreenName];
  if (!definition) {
    return (
      <box flexDirection="column" padding={1}>
        <text fg="red" attributes={TextAttributes.BOLD}>
          Unknown screen: {current.screen}
        </text>
        <text fg="gray">Press q to go back.</text>
      </box>
    );
  }

  const Component = definition.component as (props: ScreenComponentProps) => JSX.Element;
  const props: ScreenComponentProps = {
    entry: current,
    params: current.params ?? {},
  };

  return <Component {...props} />;
}
