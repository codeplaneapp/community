import { useNavigation } from "../hooks/useNavigation.js";
import { screenRegistry, ScreenName } from "../navigation/screenRegistry.js";
import { PlaceholderScreen } from "../screens/PlaceholderScreen.js";

export function ScreenRouter() {
  const nav = useNavigation();
  const current = nav.current;

  const def = screenRegistry[current.screen as ScreenName];
  if (!def) {
    return <PlaceholderScreen />;
  }

  const ScreenComponent = def.component;
  return <ScreenComponent />;
}