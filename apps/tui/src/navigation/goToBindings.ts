import { ScreenName } from "./screenRegistry.js";

export const goToBindings: Record<string, { screen: string, requiresRepo?: boolean }> = {
  d: { screen: ScreenName.Dashboard },
  i: { screen: ScreenName.Issues, requiresRepo: true },
  l: { screen: ScreenName.Landings, requiresRepo: true },
  r: { screen: ScreenName.RepoList },
  w: { screen: ScreenName.Workspaces },
  n: { screen: ScreenName.Notifications },
  s: { screen: ScreenName.Search },
  a: { screen: ScreenName.Agents },
  o: { screen: ScreenName.Organizations },
  f: { screen: ScreenName.Workflows, requiresRepo: true },
  k: { screen: ScreenName.Wiki, requiresRepo: true },
};
