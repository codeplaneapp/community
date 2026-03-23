import React from "react";

export enum ScreenName {
  Dashboard = "Dashboard",
  Issues = "Issues",
  Landings = "Landings",
  Workspaces = "Workspaces",
  Workflows = "Workflows",
  Search = "Search",
  Notifications = "Notifications",
  Settings = "Settings",
  Organizations = "Organizations",
  Agents = "Agents",
  Wiki = "Wiki",
  Sync = "Sync",
  RepoList = "RepoList",
  RepoOverview = "RepoOverview",
}

export const screenRegistry = {
  [ScreenName.Dashboard]: { component: () => <text>Dashboard</text>, breadcrumb: "Dashboard" },
  [ScreenName.Issues]: { component: () => <text>Issues</text>, breadcrumb: "Issues" },
  [ScreenName.Landings]: { component: () => <text>Landings</text>, breadcrumb: "Landings" },
  [ScreenName.Workspaces]: { component: () => <text>Workspaces</text>, breadcrumb: "Workspaces" },
  [ScreenName.Workflows]: { component: () => <text>Workflows</text>, breadcrumb: "Workflows" },
  [ScreenName.Search]: { component: () => <text>Search</text>, breadcrumb: "Search" },
  [ScreenName.Notifications]: { component: () => <text>Notifications</text>, breadcrumb: "Notifications" },
  [ScreenName.Settings]: { component: () => <text>Settings</text>, breadcrumb: "Settings" },
  [ScreenName.Organizations]: { component: () => <text>Organizations</text>, breadcrumb: "Organizations" },
  [ScreenName.Agents]: { component: () => <text>Agents</text>, breadcrumb: "Agents" },
  [ScreenName.Wiki]: { component: () => <text>Wiki</text>, breadcrumb: "Wiki" },
  [ScreenName.Sync]: { component: () => <text>Sync</text>, breadcrumb: "Sync" },
  [ScreenName.RepoList]: { component: () => <text>Repositories</text>, breadcrumb: "Repositories" },
  [ScreenName.RepoOverview]: { component: () => <text>Repositories</text>, breadcrumb: "Repositories" },
} as any;
