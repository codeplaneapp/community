# Codeplane TUI Research Findings

## 1. Project Overview
The Codeplane TUI is a first-class terminal client for the Codeplane platform, built using React 19 and OpenTUI. It targets terminal-native developers, SSH-only environments, power users, and agent-augmented workflows. It is not a fallback, but a complete client launched via `codeplane tui`.

## 2. Architecture & Tech Stack
* **Framework:** React 19 with OpenTUI reconciler.
* **Data Layer:** Consumes the Codeplane HTTP API via shared hooks from `@codeplane/ui-core` (e.g., `useRepos`, `useIssues`, `useNotifications`).
* **Streaming:** Utilizes Server-Sent Events (SSE) for real-time updates (notifications, workflow logs, workspace status, agent responses) with auto-reconnection and exponential backoff.
* **Implementation Directory:** `apps/tui/src/`

## 3. Design & Interaction Constraints
* **Input:** Keyboard-first, mouse-optional. Heavy use of Vim-inspired navigation (`j/k/h/l`, `/` for search, `:` for command palette).
* **Display:** Minimum 80x24 terminal size, gracefully degrading features (like hiding sidebars) at minimum size. ANSI 256 color baseline with truecolor support.
* **Layout:** Stack-based navigation with a Header (breadcrumbs/context), flexible Content Area, and Status Bar (keybindings/sync/notifications).
* **UI Primitives:** Relies on OpenTUI components (`<box>`, `<scrollbox>`, `<text>`, `<input>`, `<select>`, `<code>`, `<diff>`, `<markdown>`) and hooks (`useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`).

## 4. Testing Strategy
* **Framework:** `@microsoft/tui-test` located in `e2e/tui/`.
* **Methodology:** Snapshot matching, keyboard interaction simulation, and screen transition verification against a real API server.
* **Philosophy:** Tests failing due to unimplemented backend features must be left failing, never skipped.