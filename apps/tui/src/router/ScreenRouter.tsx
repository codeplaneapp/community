import type { JSX } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { screenRegistry } from "./registry.js";
import type { ScreenComponentProps } from "./types.js";
import { TextAttributes } from "../theme/tokens.js";

export function ScreenRouter() {
  const { currentScreen } = useNavigation();

  const definition = screenRegistry[currentScreen.screen];
  if (!definition) {
    return (
      <box flexDirection="column" padding={1}>
        <text fg="red" attributes={TextAttributes.BOLD}>
          Unknown screen: {currentScreen.screen}
        </text>
        <text fg="gray">Press q to go back.</text>
      </box>
    );
  }

  const Component = definition.component as (props: ScreenComponentProps) => JSX.Element;
  const props: ScreenComponentProps = {
    entry: currentScreen,
    params: currentScreen.params,
  };

  return <Component {...props} />;
}
