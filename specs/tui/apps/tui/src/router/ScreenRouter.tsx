import React from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { screenRegistry } from "./registry.js";
import type { ScreenComponentProps } from "./types.js";

export function ScreenRouter() {
  const { currentScreen } = useNavigation();

  const definition = screenRegistry[currentScreen.screen];
  if (!definition) {
    // This should never happen due to the registry completeness check,
    // but provides a safe fallback.
    return (
      <box flexDirection="column" padding={1}>
        <text color="red" bold>
          Unknown screen: {currentScreen.screen}
        </text>
        <text color="gray">Press q to go back.</text>
      </box>
    );
  }

  const Component = definition.component;
  const props: ScreenComponentProps = {
    entry: currentScreen,
    params: currentScreen.params,
  };

  return <Component {...props} />;
}
