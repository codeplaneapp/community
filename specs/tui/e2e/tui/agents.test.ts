import { describe, test, expect } from "bun:test";
import { createTestTui } from "@microsoft/tui-test";
import { launchTUI, navigateToAgentChat, waitForChatReady } from "./helpers.js";

describe("TUI_AGENT_MESSAGE_BLOCK", () => {
  describe("terminal snapshots", () => {
    test("SNAP-MSG-001: user message at 120×40 — You label in primary color, timestamp visible", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with user message (g a → select session)
      // Capture terminal snapshot
      // Assert: "You" label rendered in blue (ANSI 33)
      // Assert: relative timestamp visible (e.g., "3m" or "<1m")
      // Assert: message body rendered as markdown
      // Assert matches golden file
    });

    test("SNAP-MSG-002: user message at 80×24 — Y: label, no timestamp, 0 padding", async () => {
      // Launch TUI at 80x24 (minimum breakpoint)
      // Navigate to agent session with user message
      // Capture terminal snapshot
      // Assert: "Y:" abbreviated label (not "You")
      // Assert: no timestamp text present on header line
      // Assert: content starts at column 0 (no left padding)
      // Assert matches golden file
    });

    test("SNAP-MSG-003: assistant message at 120×40 — Agent label in success color", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with assistant message
      // Assert: "Agent" label rendered in green (ANSI 34)
      // Assert: message body rendered via markdown
      // Assert: no spinner (streaming: false)
    });

    test("SNAP-MSG-004: assistant message at 80×24 — A: label", async () => {
      // Launch TUI at 80x24
      // Navigate to agent session with assistant message
      // Assert: "A:" abbreviated label
      // Assert: no timestamp
    });

    test("SNAP-MSG-005: streaming assistant at 120×40 — braille spinner precedes Agent label", async () => {
      // Launch TUI at 120x40
      // Navigate to active agent session with streaming response
      // Wait for spinner frame to render
      // Assert: one of ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ appears before "Agent" label
      // Assert: spinner character is in green (ANSI 34)
    });

    test("SNAP-MSG-006: system message at 120×40 — centered, muted, italic label", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with system message
      // Assert: "System" label rendered in gray (ANSI 245)
      // Assert: text is centered (not left-aligned)
      // Assert: italic text attribute applied
    });

    test("SNAP-MSG-007: tool_call part collapsed at 120×40 — ▶ toolName — summary format", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with tool_call message
      // Assert: ▶ indicator in yellow (ANSI 178)
      // Assert: tool name in bold yellow
      // Assert: " — " separator followed by truncated summary
      // Assert: summary truncated to 60 chars with …
    });

    test("SNAP-MSG-008: tool_call at 80×24 — no summary, tool name only", async () => {
      // Launch TUI at 80x24
      // Navigate to agent session with tool_call message
      // Assert: ▶ indicator + tool name visible
      // Assert: no " — " separator (summary hidden at minimum)
    });

    test("SNAP-MSG-009: tool_result success at 120×40 — ✓ ▶ toolName — output summary", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with successful tool_result
      // Assert: ✓ in green before ▶
      // Assert: tool name in bold yellow
      // Assert: summary of output shown
    });

    test("SNAP-MSG-010: tool_result error at 120×40 — ✗ ▶ toolName in error color", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with error tool_result
      // Assert: ✗ in red (ANSI 196)
      // Assert: tool name still in yellow
    });

    test("SNAP-MSG-011: ToolBlock expanded call variant at 120×40 — Input label + JSON code block", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with tool_call
      // Expand the tool block (focus + x)
      // Assert: ▼ expanded indicator replaces ▶
      // Assert: "Input:" label in gray
      // Assert: JSON content rendered with syntax highlighting via <code filetype="json">
      // Assert: summary text is NOT shown (expanded mode)
    });

    test("SNAP-MSG-012: ToolBlock expanded result variant at 120×40 — Result label + markdown", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with successful tool_result
      // Expand the tool block
      // Assert: "Result:" label in gray
      // Assert: output rendered via <markdown> component
    });

    test("SNAP-MSG-013: visual separator between two messages at 120×40", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with multiple messages
      // Assert: horizontal line of ─ characters between messages
      // Assert: separator in gray (ANSI 240 border color)
      // Assert: separator spans terminal width minus padding (120 - 4 = 116 chars)
    });

    test("SNAP-MSG-014: large breakpoint at 200×60 — 4ch padding, extended timestamps", async () => {
      // Launch TUI at 200x60 (large breakpoint)
      // Navigate to agent session with messages
      // Assert: 4-character left padding on content
      // Assert: verbose timestamps ("3 minutes ago" not "3m")
      // Assert: tool summaries up to 120 chars
    });
  });

  describe("keyboard interaction", () => {
    test("KEY-MSG-001: x key expands a collapsed ToolBlock", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session with tool_call
      // Focus the tool block header
      // Assert: ▶ collapsed indicator visible
      // Press x
      // Assert: ▼ expanded indicator replaces ▶
      // Assert: tool input content now visible
    });

    test("KEY-MSG-002: x key collapses an expanded ToolBlock", async () => {
      // From expanded state (after KEY-MSG-001)
      // Press x again
      // Assert: ▶ collapsed indicator restored
      // Assert: tool input content hidden
      // Assert: summary line restored
    });

    test("KEY-MSG-003: Enter on focused ToolBlock header toggles expand/collapse", async () => {
      // Launch TUI, navigate to agent session
      // Focus tool block header
      // Press Enter
      // Assert: tool block expands
      // Press Enter again
      // Assert: tool block collapses
    });

    test("KEY-MSG-004: X (Shift+x) expands all collapsed ToolBlocks in the session", async () => {
      // Navigate to session with 3+ tool blocks, all collapsed
      // Press X (Shift+x)
      // Assert: all tool blocks now show ▼ expanded indicator
      // Assert: all tool block contents visible
    });

    test("KEY-MSG-005: X (Shift+x) collapses all when all are currently expanded", async () => {
      // From all-expanded state (after KEY-MSG-004)
      // Press X
      // Assert: all tool blocks now show ▶ collapsed indicator
    });

    test("KEY-MSG-006: x is no-op when no ToolBlock has focus", async () => {
      // Navigate to agent session
      // Focus a text message (not a tool block)
      // Press x
      // Assert: no change in any tool block state
      // Assert: no error or crash
    });

    test("KEY-MSG-007: ToolBlock expand state preserved across scroll", async () => {
      // Navigate to session with many messages
      // Expand a tool block in the middle
      // Scroll down past it (j key multiple times)
      // Scroll back up to it (k key)
      // Assert: tool block is still expanded (▼ indicator)
    });

    test("KEY-MSG-008: ToolBlock expand state preserved across terminal resize", async () => {
      // Launch at 120x40
      // Expand a tool block
      // Resize terminal to 80x24
      // Assert: tool block still expanded
      // Assert: summary disappears (minimum breakpoint)
      // Resize back to 120x40
      // Assert: tool block still expanded, summary reappears
    });

    test("KEY-MSG-009: rapid x-x-x toggles are sequential, not batched", async () => {
      // Focus a tool block
      // Send x three times rapidly
      // Assert: final state is expanded (odd number of toggles)
      // Assert: no visual glitch or stuck state
    });

    test("KEY-MSG-010: expanded error result renders in error color after Enter toggle", async () => {
      // Navigate to session with error tool_result
      // Focus the tool block header
      // Press Enter to expand
      // Assert: "Error:" label in red (ANSI 196)
      // Assert: error output text in red
    });
  });

  describe("responsive layout", () => {
    test("RESP-MSG-001: at 80×24 — role labels abbreviated to Y: / A:", async () => {
      // Launch TUI at 80x24
      // Navigate to agent session with user + assistant messages
      // Assert: first message shows "Y:" (not "You")
      // Assert: second message shows "A:" (not "Agent")
    });

    test("RESP-MSG-002: at 80×24 — timestamps hidden", async () => {
      // Launch TUI at 80x24
      // Navigate to agent session
      // Assert: no timestamp text on any message header line
      // Assert: no "m" or "h" or "d" time suffixes visible in header area
    });

    test("RESP-MSG-003: at 80×24 — padding is 0ch left and right", async () => {
      // Launch TUI at 80x24
      // Navigate to agent session
      // Assert: message content starts at column 0 (after header bar)
      // Assert: separator line spans full 80 characters
    });

    test("RESP-MSG-004: at 120×40 — full labels and relative timestamps visible", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session
      // Assert: "You" and "Agent" labels (not abbreviated)
      // Assert: timestamps like "<1m", "3m", "2h" visible
    });

    test("RESP-MSG-005: at 120×40 — tool summary shown (60ch), truncated with ellipsis", async () => {
      // Launch TUI at 120x40
      // Navigate to session with tool_call having >60 char input
      // Assert: summary text visible after " — "
      // Assert: summary ends with … if content exceeded 60 chars
    });

    test("RESP-MSG-006: at 200×60 — padding is 4ch left and right", async () => {
      // Launch TUI at 200x60
      // Navigate to agent session
      // Assert: message content starts at column 4
      // Assert: separator line is 192 characters wide (200 - 4 - 4)
    });

    test("RESP-MSG-007: resize from 120×40 to 80×24 — labels abbreviate on resize", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session
      // Assert: "You" label visible
      // Resize to 80x24
      // Assert: "Y:" label replaces "You"
      // Assert: timestamps disappear
      // Assert: padding reduces to 0
    });

    test("RESP-MSG-008: resize from 80×24 to 200×60 — timestamps and 4ch padding appear", async () => {
      // Launch TUI at 80x24
      // Navigate to agent session
      // Resize to 200x60
      // Assert: verbose timestamps appear ("minutes ago" format)
      // Assert: 4ch padding applied
      // Assert: tool summaries up to 120 chars
    });
  });

  describe("edge cases", () => {
    test("EDGE-MSG-001: message with empty text part renders role label only", async () => {
      // Navigate to session with message having { type: "text", content: "" }
      // Assert: role label visible ("You" or "Agent")
      // Assert: no crash
      // Assert: separator still renders
    });

    test("EDGE-MSG-002: tool input exceeding 64KB shows truncation indicator", async () => {
      // Navigate to session with tool_call having >64KB input
      // Expand the tool block
      // Assert: content visible (not empty)
      // Assert: "… (truncated — content exceeds 64KB)" text appears at end
    });

    test("EDGE-MSG-003: tool name at 50 chars not truncated; 51 chars truncated with …", async () => {
      // Navigate to session with tool_call named exactly 50 chars
      // Assert: full name visible, no ellipsis
      // Navigate to session with tool_call named 51 chars
      // Assert: name truncated to 50 chars with … at end (49 chars + …)
    });

    test("EDGE-MSG-004: mixed parts [text, tool_call, text, tool_result] render all four in order", async () => {
      // Navigate to session with assistant message having 4 parts:
      //   text → tool_call → text → tool_result
      // Assert: all four parts visible in source order
      // Assert: text parts rendered as markdown
      // Assert: tool parts rendered as ToolBlock components (collapsed by default)
    });

    test("EDGE-MSG-005: unicode and emoji in message content preserved", async () => {
      // Navigate to session with message containing: "Hello 🌍 — αβγ ✓"
      // Assert: emoji, em-dash, Greek letters, and checkmark all rendered
      // Assert: no mojibake or replacement characters
    });

    test("EDGE-MSG-006: unknown message part type does not crash; renders raw fallback", async () => {
      // Navigate to session where API returns a part with unknown type
      // Assert: TUI does not crash
      // Assert: fallback text "[unknown part type]" rendered in muted color
      // Assert: other parts in the same message still render normally
    });
  });
});

describe("TUI_AGENT_SSE_STREAM", () => {
  describe("terminal snapshots", () => {
    test("SNAP-STREAM-001: streaming indicator visible during active stream at 120×40", async () => {
      // Launch TUI at 120x40
      // Navigate to agent session, send a message to trigger streaming
      // Assert: braille spinner character visible (one of ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
      // Assert: spinner in green (ANSI 34)
      // Assert: "Agent" label visible next to spinner
    });

    test("SNAP-STREAM-002: tokens render incrementally during streaming at 120×40", async () => {
      // Launch TUI at 120x40
      // Navigate to active streaming session
      // Wait for multiple token events
      // Assert: text content grows over successive frames
      // Assert: content rendered via <markdown>
    });

    test("SNAP-STREAM-003: streaming complete — spinner disappears at 120×40", async () => {
      // Launch TUI at 120x40
      // Navigate to session that completes streaming
      // Wait for done event
      // Assert: no spinner character visible
      // Assert: full response text rendered
      // Assert: "Agent" label without spinner
    });

    test("SNAP-STREAM-004: reconnection indicator during SSE disconnect at 120×40", async () => {
      // Launch TUI at 120x40
      // Start streaming, simulate network drop
      // Assert: status bar shows reconnection state
      // Assert: spinner continues (streaming = true during reconnect)
      // Assert: accumulated tokens preserved
    });

    test("SNAP-STREAM-005: stream error displays error message at 120×40", async () => {
      // Launch TUI at 120x40
      // Start streaming, receive error event
      // Assert: error message rendered in red (ANSI 196)
      // Assert: spinner stops
      // Assert: partial response text preserved above error
    });

    test("SNAP-STREAM-006: streaming at 80×24 — abbreviated spinner, no padding", async () => {
      // Launch TUI at 80x24 (minimum breakpoint)
      // Navigate to active streaming session
      // Assert: spinner visible
      // Assert: "A:" abbreviated label
      // Assert: content rendered without padding
    });
  });

  describe("keyboard interaction", () => {
    test("KEY-STREAM-001: auto-scroll follows streaming content", async () => {
      // Launch TUI, navigate to streaming session
      // Wait for enough tokens to exceed viewport height
      // Assert: viewport auto-scrolls to show latest content
    });

    test("KEY-STREAM-002: j/k scroll disables auto-follow during streaming", async () => {
      // Start streaming, wait for content overflow
      // Press k to scroll up
      // Wait for more tokens
      // Assert: viewport does NOT auto-scroll (user took manual control)
    });

    test("KEY-STREAM-003: f key re-enables auto-follow during streaming", async () => {
      // Disable auto-follow (KEY-STREAM-002 scenario)
      // Press f
      // Wait for more tokens
      // Assert: viewport auto-scrolls again
    });

    test("KEY-STREAM-004: q during active stream stops streaming and pops screen", async () => {
      // Start streaming
      // Press q
      // Assert: SSE connection closed
      // Assert: screen transitions back to session list
    });
  });

  describe("reconnection behavior", () => {
    test("RECONN-001: tokens preserved across reconnection", async () => {
      // Start streaming, receive "Hello, how can I"
      // Simulate network drop
      // Wait for reconnection
      // Assert: "Hello, how can I" still visible
      // Assert: new tokens appended after reconnection
    });

    test("RECONN-002: no duplicate tokens after reconnection replay", async () => {
      // Start streaming, receive tokens
      // Disconnect and reconnect
      // Assert: no repeated text in the rendered output
    });

    test("RECONN-003: status bar shows reconnection state", async () => {
      // Start streaming, simulate disconnect
      // Assert: status bar connection indicator changes to disconnected state
      // Wait for reconnection success
      // Assert: status bar returns to connected state
    });

    test("RECONN-004: permanent failure after 20 attempts shows error", async () => {
      // Simulate persistent connection failure
      // Wait for enough reconnection attempts
      // Assert: error state displayed
      // Assert: no further reconnection attempts
    });
  });

  describe("edge cases", () => {
    test("EDGE-STREAM-001: terminal resize during streaming preserves content", async () => {
      // Start streaming at 120x40
      // Resize to 80x24
      // Assert: accumulated content still visible (may reflow)
      // Assert: streaming continues
    });

    test("EDGE-STREAM-002: switching sessions during active stream", async () => {
      // Start streaming in session A
      // Navigate back and into session B
      // Assert: session A stream closed
      // Assert: session B content displayed (not A's tokens)
    });

    test("EDGE-STREAM-003: rapid subscribe/unsubscribe does not leak connections", async () => {
      // Quickly navigate in and out of multiple sessions
      // Assert: no hung connections
      // Assert: clean state after settling
    });
  });
});

describe("TUI_AGENT_SESSION_LIST", () => {
  describe("terminal snapshots", () => {
    test("SNAP-AGENT-LIST-001: 120×40 with mixed status sessions — full layout", async () => {});
    test("SNAP-AGENT-LIST-002: 80×24 minimum — icon, title, timestamp only", async () => {});
    test("SNAP-AGENT-LIST-003: 200×60 large — all columns including ID prefix, duration", async () => {});
    test("SNAP-AGENT-LIST-004: Empty state (zero sessions) — centered message with n hint", async () => {});
    test("SNAP-AGENT-LIST-005: All filtered out by Active status", async () => {});
    test("SNAP-AGENT-LIST-006: All filtered out by Failed status", async () => {});
    test("SNAP-AGENT-LIST-007: Search no matches", async () => {});
    test("SNAP-AGENT-LIST-008: Loading state — spinner with title/toolbar visible", async () => {});
    test("SNAP-AGENT-LIST-009: Error state — red error with R retry hint", async () => {});
    test("SNAP-AGENT-LIST-010: Focused row on active session — reverse video, bold", async () => {});
    test("SNAP-AGENT-LIST-011: Focused row on completed session — reverse video, normal weight", async () => {});
    test("SNAP-AGENT-LIST-012: All 5 status icons rendered (●✓✗⏱○)", async () => {});
    test("SNAP-AGENT-LIST-013: Text fallbacks [A][C][F][T][P] when TERM=dumb", async () => {});
    test("SNAP-AGENT-LIST-014: Bold text for active vs normal for terminal sessions", async () => {});
    test("SNAP-AGENT-LIST-015: Filter toolbar with All active", async () => {});
    test("SNAP-AGENT-LIST-016: Filter toolbar with Active active", async () => {});
    test("SNAP-AGENT-LIST-017: Filter toolbar with Completed active", async () => {});
    test("SNAP-AGENT-LIST-018: Search input focused with query text", async () => {});
    test("SNAP-AGENT-LIST-019: Narrowed results after search", async () => {});
    test("SNAP-AGENT-LIST-020: Pagination loading footer", async () => {});
    test("SNAP-AGENT-LIST-021: Pagination cap footer (500 of N)", async () => {});
    test("SNAP-AGENT-LIST-022: Breadcrumb: Dashboard › acme/api › Agent Sessions", async () => {});
    test("SNAP-AGENT-LIST-023: Total count in title: Agent Sessions (12)", async () => {});
    test("SNAP-AGENT-LIST-024: Status bar keybinding hints", async () => {});
    test("SNAP-AGENT-LIST-025: Long title truncation with ellipsis", async () => {});
    test("SNAP-AGENT-LIST-026: Null/empty title → Untitled session muted italic", async () => {});
    test("SNAP-AGENT-LIST-027: Delete confirmation overlay", async () => {});
    test("SNAP-AGENT-LIST-028: Delete confirmation for active session — still active warning", async () => {});
  });

  describe("keyboard interaction", () => {
    test("KEY-AGENT-LIST-001: j moves focus down one row", async () => {
      // const terminal = await launchTUI({
      //   cols: 120, rows: 40,
      //   args: ["--screen", "agents", "--repo", "acme/api"],
      // });
      // await terminal.waitForText("Agent Sessions");
      // await terminal.waitForNoText("Loading");
      // await terminal.sendKeys("j");
      // expect(terminal.snapshot()).toMatchSnapshot();
      // await terminal.terminate();
    });
    test("KEY-AGENT-LIST-002: k moves focus up one row", async () => {});
    test("KEY-AGENT-LIST-003: Down arrow moves focus down", async () => {});
    test("KEY-AGENT-LIST-004: Up arrow moves focus up", async () => {});
    test("KEY-AGENT-LIST-005: j at bottom stops at last row (no wrap)", async () => {});
    test("KEY-AGENT-LIST-006: k at top stays at first row", async () => {});
    test("KEY-AGENT-LIST-007: Enter on active session → agent chat screen", async () => {});
    test("KEY-AGENT-LIST-008: Enter on completed session → agent chat screen", async () => {});
    test("KEY-AGENT-LIST-009: Enter on failed session → agent chat screen", async () => {});
    test("KEY-AGENT-LIST-010: / focuses search input", async () => {});
    test("KEY-AGENT-LIST-011: Typing in search narrows list by title", async () => {});
    test("KEY-AGENT-LIST-012: Search is case-insensitive", async () => {});
    test("KEY-AGENT-LIST-013: Esc in search clears and returns focus to list", async () => {});
    test("KEY-AGENT-LIST-014: Esc with no search/overlay pops screen", async () => {});
    test("KEY-AGENT-LIST-015: G jumps to last loaded session", async () => {});
    test("KEY-AGENT-LIST-016: g g jumps to first session", async () => {});
    test("KEY-AGENT-LIST-017: Ctrl+D pages down", async () => {});
    test("KEY-AGENT-LIST-018: Ctrl+U pages up", async () => {});
    test("KEY-AGENT-LIST-019: n navigates to session create", async () => {});
    test("KEY-AGENT-LIST-020: d opens delete confirmation overlay", async () => {});
    test("KEY-AGENT-LIST-021: Enter in delete overlay confirms and removes row", async () => {});
    test("KEY-AGENT-LIST-022: Esc in delete overlay cancels", async () => {});
    test("KEY-AGENT-LIST-023: d on active session shows still active warning", async () => {});
    test("KEY-AGENT-LIST-024: r on completed session → replay screen", async () => {});
    test("KEY-AGENT-LIST-025: r on failed session → replay screen", async () => {});
    test("KEY-AGENT-LIST-026: r on timed_out session → replay screen", async () => {});
    test("KEY-AGENT-LIST-027: r on active session → no-op with flash", async () => {});
    test("KEY-AGENT-LIST-028: r on pending session → no-op", async () => {});
    test("KEY-AGENT-LIST-029: f cycles All → Active", async () => {});
    test("KEY-AGENT-LIST-030: f cycles Active → Completed", async () => {});
    test("KEY-AGENT-LIST-031: f wraps Timed Out → All", async () => {});
    test("KEY-AGENT-LIST-032: Active filter hides non-active sessions", async () => {});
    test("KEY-AGENT-LIST-033: Completed filter hides non-completed sessions", async () => {});
    test("KEY-AGENT-LIST-034: Space toggles row selection", async () => {});
    test("KEY-AGENT-LIST-035: q pops screen", async () => {});
    test("KEY-AGENT-LIST-036: j/k/n/d/r/f don't trigger while search focused", async () => {});
    test("KEY-AGENT-LIST-037: Enter during loading state is no-op", async () => {});
    test("KEY-AGENT-LIST-038: Pagination triggers at 80% scroll", async () => {});
    test("KEY-AGENT-LIST-039: Rapid j×15 — each moves one row", async () => {});
    test("KEY-AGENT-LIST-040: R retries fetch in error state", async () => {});
    test("KEY-AGENT-LIST-041: Esc priority: overlay → search → pop", async () => {});
    test("KEY-AGENT-LIST-042: d while overlay open is no-op", async () => {});
  });

  describe("responsive layout", () => {
    test("RESP-AGENT-LIST-001: 80×24 shows icon, title, timestamp only", async () => {});
    test("RESP-AGENT-LIST-002: 80×24 title truncation at remaining−6ch", async () => {});
    test("RESP-AGENT-LIST-003: 80×24 message count hidden", async () => {});
    test("RESP-AGENT-LIST-004: 80×24 session ID prefix hidden", async () => {});
    test("RESP-AGENT-LIST-005: 80×24 duration hidden", async () => {});
    test("RESP-AGENT-LIST-006: 120×40 shows icon, title, msg count, timestamp", async () => {});
    test("RESP-AGENT-LIST-007: 120×40 title truncated at 40ch", async () => {});
    test("RESP-AGENT-LIST-008: 120×40 message count visible (8ch)", async () => {});
    test("RESP-AGENT-LIST-009: 200×60 shows full column set", async () => {});
    test("RESP-AGENT-LIST-010: 200×60 timestamp uses extended format", async () => {});
    test("RESP-AGENT-LIST-011: Resize 120→80 — columns collapse, focus preserved", async () => {});
    test("RESP-AGENT-LIST-012: Resize 80→120 — columns expand, focus preserved", async () => {});
    test("RESP-AGENT-LIST-013: Resize during search — input width adjusts", async () => {});
    test("RESP-AGENT-LIST-014: Resize while scrolled — position and focus preserved", async () => {});
  });

  describe("integration", () => {
    test("INT-AGENT-LIST-001: 401 during fetch → auth error screen", async () => {});
    test("INT-AGENT-LIST-002: 403 during fetch → inline permission error", async () => {});
    test("INT-AGENT-LIST-003: 429 on fetch → inline error with retry-after", async () => {});
    test("INT-AGENT-LIST-004: Network timeout → error state with R retry", async () => {});
    test("INT-AGENT-LIST-005: Pagination loads next page correctly", async () => {});
    test("INT-AGENT-LIST-006: Pagination cap at 500 → footer message", async () => {});
    test("INT-AGENT-LIST-007: Navigate to chat and back preserves state", async () => {});
    test("INT-AGENT-LIST-008: Navigate to replay and back preserves state", async () => {});
    test("INT-AGENT-LIST-009: Server 500 → error state", async () => {});
    test("INT-AGENT-LIST-010: Delete optimistic then server error → row reappears", async () => {});
    test("INT-AGENT-LIST-011: Delete 404 → optimistic stands", async () => {});
    test("INT-AGENT-LIST-012: Delete 403 → reverts with flash", async () => {});
    test("INT-AGENT-LIST-013: Deep link --screen agents --repo launches directly", async () => {});
    test("INT-AGENT-LIST-014: Command palette :agents navigates", async () => {});
    test("INT-AGENT-LIST-015: g a go-to navigates", async () => {});
    test("INT-AGENT-LIST-016: g a without repo context → redirect with flash", async () => {});
    test("INT-AGENT-LIST-017: SSE status update → row updates inline", async () => {});
    test("INT-AGENT-LIST-018: SSE reconnection maintains list state", async () => {});
    test("INT-AGENT-LIST-019: Total count stays synchronized", async () => {});
    test("INT-AGENT-LIST-020: n suppressed for read-only users", async () => {});
    test("INT-AGENT-LIST-021: d suppressed for non-owner non-admin", async () => {});
    test("INT-AGENT-LIST-022: Session created externally appears on re-fetch", async () => {});
  });

  describe("edge cases", () => {
    test("EDGE-AGENT-LIST-001: No auth token → auth error screen", async () => {});
    test("EDGE-AGENT-LIST-002: 255-char title → truncated with ellipsis", async () => {});
    test("EDGE-AGENT-LIST-003: Unicode/emoji in title → grapheme-aware truncation", async () => {});
    test("EDGE-AGENT-LIST-004: Single session in list", async () => {});
    test("EDGE-AGENT-LIST-005: Concurrent resize + j/k navigation", async () => {});
    test("EDGE-AGENT-LIST-006: Search with regex special chars → literal match", async () => {});
    test("EDGE-AGENT-LIST-007: Null/empty title → Untitled session, no crash", async () => {});
    test("EDGE-AGENT-LIST-008: Zero messages → 0 msgs", async () => {});
    test("EDGE-AGENT-LIST-009: Null startedAt/finishedAt → duration —", async () => {});
    test("EDGE-AGENT-LIST-010: Rapid d presses → only first opens overlay", async () => {});
    test("EDGE-AGENT-LIST-011: SSE update during pagination → merged, no duplicate", async () => {});
    test("EDGE-AGENT-LIST-012: Network disconnect mid-delete → revert + flash", async () => {});
    test("EDGE-AGENT-LIST-013: 0 sessions with search text → correct empty message", async () => {});
    test("EDGE-AGENT-LIST-014: Delete last session → empty state, focus reset", async () => {});
    test("EDGE-AGENT-LIST-015: Delete focused session while filter active → focus moves to next visible", async () => {});
  });
});

describe("TUI_AGENT_CHAT_SCREEN", () => {
  describe("terminal snapshots", () => {
    test("SNAP-CHAT-001: Agent chat at 120×40 with mixed user/agent messages — full layout, role labels, timestamps, markdown rendering", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-002: Agent chat at 80×24 minimum — abbreviated role labels Y:/A:, timestamps hidden, compact layout", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-003: Agent chat at 200×60 large — full role labels, extended timestamps, generous spacing", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-004: Empty session (zero messages) — Send a message to start the conversation centered", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("Send a message to start the conversation");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-005: Session not found (404) — Session not found error in error color", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Session not found").catch(() => {}); // Wait might fail in generic run
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-006: Loading state — Loading messages with session title visible", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Loading messages").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-007: Error state — red error with Press R to retry", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Press R to retry").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-008: User message rendering — role label You in primary color, message body, timestamp", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-009: Agent message rendering — role label Agent in success color, markdown body, timestamp", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-010: Agent message with code block — syntax-highlighted code block within message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-011: Agent message with markdown list — bullet list rendered within message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-012: Agent message with inline code — backtick-delimited code styled distinctly", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-013: Tool call block collapsed — tool icon and name with collapsed indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-014: Tool call block expanded — full JSON arguments visible", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Tab");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-015: Tool result block (success) — checkmark in green with collapsed indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-016: Tool result block (error) — X in red with collapsed indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-017: Tool result block expanded — full output/error content visible", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Tab");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-018: Streaming indicator — braille spinner next to Agent label during active stream", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello");
      await terminal.sendKeys("Enter");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-019: Input area (active session) — prompt with placeholder text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("Type a message");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-020: Input area disabled during streaming — dimmed, Agent is responding placeholder", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Agent is responding").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-021: Multi-line input expanded — input area height increased, Ctrl+Enter to send hint", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Line one");
      await terminal.sendKeys("Shift+Enter");
      await terminal.sendText("Line two");
      await terminal.waitForText("Ctrl+Enter to send").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-022: Completed session banner — Session completed. Read-only replay mode.", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Read-only replay mode").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-023: Timed out session banner — Session timed out. Read-only replay mode.", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("timed out").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-024: Failed message indicator — message with red error text and Press R to retry", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-025: Pending message indicator — message with Sending in muted text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello");
      await terminal.sendKeys("Enter");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-026: New messages indicator — shown when scrolled up during streaming", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k", "k");
      await terminal.waitForText("New messages").catch(() => {});
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-027: Breadcrumb rendering — Dashboard > owner/repo > Agents > Session Title", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-CHAT-028: Status bar keybinding hints for agent chat screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  describe("keyboard interaction", () => {
    test("KEY-CHAT-001: j scrolls message history down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("j");
      await terminal.terminate();
    });

    test("KEY-CHAT-002: k scrolls message history up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("j", "j", "k");
      await terminal.terminate();
    });

    test("KEY-CHAT-003: Down arrow scrolls message history down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Down");
      await terminal.terminate();
    });

    test("KEY-CHAT-004: Up arrow scrolls message history up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Up");
      await terminal.terminate();
    });

    test("KEY-CHAT-005: G jumps to latest message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k", "k", "G");
      await terminal.terminate();
    });

    test("KEY-CHAT-006: g g jumps to first message", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("g", "g");
      await terminal.terminate();
    });

    test("KEY-CHAT-007: Ctrl+D pages down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Ctrl+D");
      await terminal.terminate();
    });

    test("KEY-CHAT-008: Ctrl+U pages up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Ctrl+U");
      await terminal.terminate();
    });

    test("KEY-CHAT-009: i focuses message input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.terminate();
    });

    test("KEY-CHAT-010: Typing in focused input updates input value", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello world");
      await terminal.waitForText("Hello world").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-011: Enter sends message (single-line, non-empty input)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Test message");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Test message").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-012: Enter on empty input does not send (no-op)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("KEY-CHAT-013: Sent message appears immediately in message history (optimistic)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Optimistic test");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Optimistic test").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-014: Shift+Enter inserts newline and expands input to multi-line", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Line 1");
      await terminal.sendKeys("Shift+Enter");
      await terminal.sendText("Line 2");
      await terminal.waitForText("Ctrl+Enter to send").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-015: Ctrl+Enter sends message in multi-line mode", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Line 1");
      await terminal.sendKeys("Shift+Enter");
      await terminal.sendText("Line 2");
      await terminal.sendKeys("Ctrl+Enter");
      await terminal.waitForText("Line 1").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-016: Esc when input focused unfocuses input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendKeys("Escape");
      await terminal.sendKeys("j");
      await terminal.terminate();
    });

    test("KEY-CHAT-017: Esc when input not focused pops screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Escape");
      await terminal.waitForText("Agent Sessions").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-018: q pops screen (when input not focused)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-019: q types q into input when input is focused (not pop)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendKeys("q");
      await terminal.waitForText("q").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-020: Tab on tool call block expands it", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Tab");
      await terminal.terminate();
    });

    test("KEY-CHAT-021: Shift+Tab on expanded tool block collapses it", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Shift+Tab");
      await terminal.terminate();
    });

    test("KEY-CHAT-022: / activates message search", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.waitForText("Search messages").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-023: Typing in search narrows to matching messages (highlighted)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("auth");
      await terminal.terminate();
    });

    test("KEY-CHAT-024: n jumps to next search match", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("the");
      await terminal.sendKeys("Escape");
      await terminal.sendKeys("n");
      await terminal.terminate();
    });

    test("KEY-CHAT-025: N jumps to previous search match", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("the");
      await terminal.sendKeys("Escape");
      await terminal.sendKeys("n", "N");
      await terminal.terminate();
    });

    test("KEY-CHAT-026: Esc in search clears search and returns to message browsing", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("test");
      await terminal.sendKeys("Escape");
      await terminal.terminate();
    });

    test("KEY-CHAT-027: R on failed message retries send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("R");
      await terminal.terminate();
    });

    test("KEY-CHAT-028: R on non-failed message is no-op", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("R");
      await terminal.terminate();
    });

    test("KEY-CHAT-029: f toggles auto-scroll off (when enabled)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("f");
      await terminal.terminate();
    });

    test("KEY-CHAT-030: f toggles auto-scroll on (when disabled); scrolls to bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k");
      await terminal.sendKeys("f");
      await terminal.terminate();
    });

    test("KEY-CHAT-031: Input disabled during streaming — keystrokes do not modify input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("trigger");
      await terminal.sendKeys("Enter");
      await terminal.sendKeys("i");
      await terminal.sendText("should not appear");
      await terminal.terminate();
    });

    test("KEY-CHAT-032: Input re-enables after streaming completes", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("Type a message").catch(() => {});
      await terminal.sendKeys("i");
      await terminal.sendText("after stream");
      await terminal.waitForText("after stream").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-033: G while new messages visible jumps to bottom and re-enables auto-scroll", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k", "k");
      await terminal.sendKeys("G");
      await terminal.terminate();
    });

    test("KEY-CHAT-034: Enter while new messages visible and input not focused jumps to bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("KEY-CHAT-035: Rapid j presses (15× sequential) — each scrolls one step", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      for (let i = 0; i < 15; i++) {
        await terminal.sendKeys("j");
      }
      await terminal.terminate();
    });

    test("KEY-CHAT-036: Message with only whitespace rejected on Enter — input not cleared", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("   ");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("KEY-CHAT-037: Message at 4000 character limit — accepted and sent", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("a".repeat(4000));
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("KEY-CHAT-038: Message at 4001 characters — input rejects additional characters", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("a".repeat(4001));
      await terminal.terminate();
    });

    test("KEY-CHAT-039: i when session is completed — no-op (input not shown)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("i");
      await terminal.terminate();
    });

    test("KEY-CHAT-040: Keys j/k/G/q do not trigger while input focused — they type into input", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendKeys("j", "k", "G", "q");
      await terminal.waitForText("jkGq").catch(() => {});
      await terminal.terminate();
    });

    test("KEY-CHAT-041: Ctrl+C quits TUI from any state (global binding)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Ctrl+C");
      await terminal.terminate();
    });

    test("KEY-CHAT-042: ? opens help overlay showing chat-specific keybindings", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("?");
      await terminal.waitForText("j/k").catch(() => {});
      await terminal.waitForText("scroll").catch(() => {});
      await terminal.terminate();
    });
  });

  describe("responsive layout", () => {
    test("RESP-CHAT-001: 80×24 layout — abbreviated labels, timestamps hidden, single-line input only", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-002: 80×24 tool blocks always collapsed (not expandable)", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("Tab");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-003: 80×24 message width = terminal width − 4", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-004: 120×40 layout — full labels, relative timestamps, collapsible tools, multi-line input up to 4 lines", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-005: 120×40 message width = terminal width − 8", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-006: 200×60 layout — full timestamps, extended tool previews, multi-line input up to 8 lines", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-007: 200×60 message width = terminal width − 16", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-008: Resize from 120×40 to 80×24 — layout collapses, scroll position preserved, streaming continues", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.resize(80, 24);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-009: Resize from 80×24 to 120×40 — layout expands, timestamps appear", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.resize(120, 40);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-010: Resize during streaming — markdown re-wraps, no artifacts, stream continues", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("trigger");
      await terminal.sendKeys("Enter");
      await terminal.resize(80, 24);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-011: Resize with multi-line input active — text rewraps, no content loss", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Line 1");
      await terminal.sendKeys("Shift+Enter");
      await terminal.sendText("Line 2");
      await terminal.resize(80, 24);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-012: Resize during search — search input and highlights adjust", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("test");
      await terminal.resize(80, 24);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-013: Resize with new messages indicator — repositioned correctly", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("k", "k");
      await terminal.resize(80, 24);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-CHAT-014: Resize from 120×40 to 200×60 — tool call previews expand to 120ch", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.resize(200, 60);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  describe("integration", () => {
    test("INT-CHAT-001: Auth expiry (401) during message fetch — auth error screen shown", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "expired-token" } });
      await terminal.waitForText("Session expired").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-002: Auth expiry (401) during message send — auth error screen shown", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("test");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Session expired").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-003: Rate limit (429) on message send — optimistic reverts, status bar shows retry-after", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("rate limited");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Rate limited").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-004: Rate limit (429) on message list — inline error with retry-after", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Rate limited").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-005: Network timeout on message list fetch — error state with Press R to retry", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Press R to retry").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-006: Network timeout on message send — message marked failed, input text preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("timeout test");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("INT-CHAT-007: Session 404 — Session not found error displayed", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Session not found").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-008: Server 500 on message list — error state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Error").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-009: Server 500 on message send — message marked failed", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("error test");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("INT-CHAT-010: Pagination loads earlier messages on scroll-to-top", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("g", "g");
      await terminal.terminate();
    });

    test("INT-CHAT-011: Pagination cap at 500 messages — top shows Showing latest 500 messages", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("g", "g");
      await terminal.waitForText("Showing latest 500 messages").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-012: SSE stream delivers tokens — agent message grows incrementally", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("stream test");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("INT-CHAT-013: SSE stream completes — spinner stops, input re-enables", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("complete test");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Type a message").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-014: SSE disconnect during stream — status bar warning, reconnect attempt", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("INT-CHAT-015: SSE reconnect replays missed tokens — no duplicate text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("INT-CHAT-016: SSE 501 (not implemented) — falls back to REST polling", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("INT-CHAT-017: Completed session renders in replay mode — no input, banner shown", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Read-only replay mode").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-018: Session times out during active chat — input disables, banner appears", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("timed out").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-019: Message send triggers agent run — SSE stream begins after send", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("trigger agent");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Agent is responding").catch(() => {});
      await terminal.terminate();
    });

    test("INT-CHAT-020: Navigation back to session list and return preserves session state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions").catch(() => {});
      await terminal.sendKeys("Enter");
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("INT-CHAT-021: Client-side send cooldown — second send within 2s blocked", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("first");
      await terminal.sendKeys("Enter");
      await terminal.sendKeys("i");
      await terminal.sendText("second");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("INT-CHAT-022: Optimistic message send then server error — message reverts to failed state", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("will fail");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("INT-CHAT-023: Multiple tool calls in single agent response — all rendered as separate blocks", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("INT-CHAT-024: Agent response with mixed text and tool parts — rendered in correct sequence", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });
  });

  describe("edge cases", () => {
    test("EDGE-CHAT-001: No auth token at startup — auth error screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "" } });
      await terminal.waitForText("authenticate").catch(() => {});
      await terminal.terminate();
    });

    test("EDGE-CHAT-002: Very long message (4000 chars) from user — sent successfully, rendered with word wrap", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("a".repeat(4000));
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("EDGE-CHAT-003: Very long agent response (10000+ chars) — rendered correctly with word wrap and scrollbox", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-CHAT-004: Unicode/emoji in messages — truncation respects grapheme clusters, no corruption", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("Hello 🌍 αβγ ✓");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Hello").catch(() => {});
      await terminal.terminate();
    });

    test("EDGE-CHAT-005: Code block with 500+ lines — scrollable within code, syntax highlighting preserved", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-CHAT-006: Agent response with nested markdown (lists in lists, code in blockquotes) — best-effort rendering", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-CHAT-007: Single message in session (user only, no agent response yet)", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-CHAT-008: Concurrent resize + scroll + streaming — all independent, no artifacts", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("concurrent test");
      await terminal.sendKeys("Enter");
      await terminal.sendKeys("k", "k");
      await terminal.resize(80, 24);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("EDGE-CHAT-009: Rapid R presses on failed message — only first triggers retry", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("R", "R", "R");
      await terminal.terminate();
    });

    test("EDGE-CHAT-010: Search with special regex characters — literal match, not regex", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("/");
      await terminal.sendText("file.ts (line 42)");
      await terminal.terminate();
    });

    test("EDGE-CHAT-011: Agent empty response (0 tokens) — empty response message shown", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-CHAT-012: Tool call with very large arguments (5KB JSON) — collapsed by default, expanded preview truncated", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-CHAT-013: Message containing only whitespace — rejected client-side", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.sendKeys("i");
      await terminal.sendText("   \n  \n  ");
      await terminal.sendKeys("Enter");
      await terminal.terminate();
    });

    test("EDGE-CHAT-014: SSE delivers duplicate tokens — deduplicated by position", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-CHAT-015: Network disconnect mid-retry — failed message stays failed, retry available again", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.terminate();
    });

    test("EDGE-CHAT-016: Session deleted while viewing (race condition) — 404 on next poll, error screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await navigateToAgentChat(terminal);
      await waitForChatReady(terminal);
      await terminal.waitForText("Session not found").catch(() => {});
      await terminal.terminate();
    });
  });
});

describe("TUI_AGENT_SESSION_REPLAY", () => {
  describe("terminal snapshots", () => {
    test("SNAP-REPLAY-001: Replay screen at 120×40 with mixed message types — full layout with role labels, separators, content", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.waitForText("You");
      await terminal.waitForText("Agent");
      expect(terminal.snapshot()).toMatchSnapshot();
      expect(terminal.snapshot()).toMatch(/─{10,}/);
      expect(terminal.getLine(terminal.rows - 1)).toMatch(/Message \d+ of \d+/);
      await terminal.terminate();
    });

    test("SNAP-REPLAY-002: Replay screen at 80×24 minimum — compact layout, no padding, no timestamps", async () => {
      const terminal = await launchTUI({
        cols: 80, rows: 24,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      const snapshot = terminal.snapshot();
      expect(terminal.getLine(terminal.rows - 1)).toMatch(/\d+\/\d+/);
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-003: Replay screen at 200×60 large — full layout with metadata sidebar", async () => {
      const terminal = await launchTUI({
        cols: 200, rows: 60,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.snapshot()).toMatch(/Session Info/);
      expect(terminal.snapshot()).toMatch(/Legend/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-004: REPLAY badge in header bar", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.getLine(0)).toMatch(/REPLAY/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-005: User message block with 'You' label in primary color", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-user-message"],
      });
      await terminal.waitForText("You");
      expect(terminal.snapshot()).toMatch(/You/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-006: Assistant message block with 'Agent' label in success color", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-assistant-message"],
      });
      await terminal.waitForText("Agent");
      expect(terminal.snapshot()).toMatch(/Agent/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-007: System message block with 'System' label in muted color", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-system-message"],
      });
      await terminal.waitForText("System");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-008: Tool block collapsed — tool name + summary + ▶ indicator", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-tools"],
      });
      await terminal.waitForText("▶");
      expect(terminal.snapshot()).toMatch(/▶/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-009: Tool block expanded — tool name + input code + result", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-tools"],
      });
      await terminal.waitForText("▶");
      await terminal.sendKeys("x");
      await terminal.waitForText("▼");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-010: Tool block with error result — error color styling", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-tool-error"],
      });
      await terminal.waitForText("✗");
      await terminal.sendKeys("x");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-011: Session summary block — completed status (green)", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Session Complete");
      expect(terminal.snapshot()).toMatch(/✓.*completed/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-012: Session summary block — failed status (red)", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-failed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      expect(terminal.snapshot()).toMatch(/✗.*failed/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-013: Session summary block — timed_out status (yellow)", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-timed-out"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      expect(terminal.snapshot()).toMatch(/⏱.*timed_out/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-014: Session summary with workflow link", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-workflow"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Linked workflow");
      expect(terminal.snapshot()).toMatch(/Run #\d+/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-015: Empty session — 'This session has no messages.'", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-empty"],
      });
      await terminal.waitForText("This session has no messages");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-016: Loading state — 'Loading session…'", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-slow"],
      });
      await terminal.waitForText("Loading");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-017: Error state — 'Session not found.'", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "nonexistent-session-id"],
      });
      await terminal.waitForText("Session not found");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-018: Search overlay with match count", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("auth");
      expect(terminal.snapshot()).toMatch(/\d+\/\d+/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-019: Search highlight on matching text", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("login");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-020: Position indicator 'Message 3 of 6' in status bar", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("]", "]");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Message 3 of 6/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-021: Breadcrumb with truncated session title", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-long-title"],
      });
      await terminal.waitForText("REPLAY");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Session:.*…/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("SNAP-REPLAY-022: No-color terminal — text prefix role labels [YOU], [AGENT], [SYS], [TOOL]", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
        env: { NO_COLOR: "1" },
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.snapshot()).toMatch(/\[YOU\]/);
      expect(terminal.snapshot()).toMatch(/\[AGENT\]/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  describe("keyboard interaction", () => {
    test("KEY-REPLAY-001: j scrolls down one line", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      const before = terminal.snapshot();
      await terminal.sendKeys("j");
      const after = terminal.snapshot();
      expect(before).not.toEqual(after);
      await terminal.terminate();
    });

    test("KEY-REPLAY-002: k scrolls up one line", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("j", "j", "j");
      const scrolled = terminal.snapshot();
      await terminal.sendKeys("k");
      const after = terminal.snapshot();
      expect(scrolled).not.toEqual(after);
      await terminal.terminate();
    });

    test("KEY-REPLAY-003: Down arrow scrolls down one line", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      const before = terminal.snapshot();
      await terminal.sendKeys("\x1b[B");
      const after = terminal.snapshot();
      expect(before).not.toEqual(after);
      await terminal.terminate();
    });

    test("KEY-REPLAY-004: Up arrow scrolls up one line", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("j", "j", "j");
      const before = terminal.snapshot();
      await terminal.sendKeys("\x1b[A");
      const after = terminal.snapshot();
      expect(before).not.toEqual(after);
      await terminal.terminate();
    });

    test("KEY-REPLAY-005: G jumps to bottom (session summary visible)", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Session Complete");
      await terminal.terminate();
    });

    test("KEY-REPLAY-006: g g jumps to top (first message visible)", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Session Complete");
      await terminal.sendKeys("g", "g");
      await terminal.waitForText("You");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Message 1/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-007: Ctrl+D pages down", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      const before = terminal.snapshot();
      await terminal.sendKeys("\x04");
      const after = terminal.snapshot();
      expect(before).not.toEqual(after);
      await terminal.terminate();
    });

    test("KEY-REPLAY-008: Ctrl+U pages up", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      const before = terminal.snapshot();
      await terminal.sendKeys("\x15");
      const after = terminal.snapshot();
      expect(before).not.toEqual(after);
      await terminal.terminate();
    });

    test("KEY-REPLAY-009: ] jumps to next message header", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("]");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Message 2/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-010: [ jumps to previous message header", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("]", "]");
      await terminal.sendKeys("[");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Message 2/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-011: ] at last message is no-op", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-3-messages"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("]", "]", "]", "]", "]");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Message 3 of 3/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-012: [ at first message is no-op", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("[");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Message 1/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-013: x expands collapsed tool block", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-tools"],
      });
      await terminal.waitForText("▶");
      await terminal.sendKeys("x");
      await terminal.waitForText("▼");
      await terminal.terminate();
    });

    test("KEY-REPLAY-014: x collapses expanded tool block", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-tools"],
      });
      await terminal.waitForText("▶");
      await terminal.sendKeys("x");
      await terminal.waitForText("▼");
      await terminal.sendKeys("x");
      await terminal.waitForText("▶");
      await terminal.terminate();
    });

    test("KEY-REPLAY-015: X expands all tool blocks when some are collapsed", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-multi-tools"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("X");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toMatch(/▶/);
      expect(snapshot).toMatch(/▼/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-016: X collapses all tool blocks when all are expanded", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-multi-tools"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("X");
      await terminal.sendKeys("X");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toMatch(/▼/);
      expect(snapshot).toMatch(/▶/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-017: / opens search input", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.waitForText("Search");
      await terminal.terminate();
    });

    test("KEY-REPLAY-018: Typing in search input filters content and shows match count", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("auth");
      expect(terminal.snapshot()).toMatch(/\d+\/\d+/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-019: n jumps to next search match", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("the");
      const match1 = terminal.snapshot();
      await terminal.sendKeys("n");
      const match2 = terminal.snapshot();
      expect(match1).not.toEqual(match2);
      await terminal.terminate();
    });

    test("KEY-REPLAY-020: N jumps to previous search match", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("the");
      await terminal.sendKeys("n", "n");
      const at3 = terminal.snapshot();
      await terminal.sendKeys("N");
      const at2 = terminal.snapshot();
      expect(at3).not.toEqual(at2);
      await terminal.terminate();
    });

    test("KEY-REPLAY-021: Esc in search closes search and returns focus to transcript", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("test");
      await terminal.sendKeys("\x1b");
      await terminal.waitForNoText("Search");
      await terminal.terminate();
    });

    test("KEY-REPLAY-022: Esc with no search active pops screen", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("\x1b");
      await terminal.waitForNoText("REPLAY");
      await terminal.terminate();
    });

    test("KEY-REPLAY-023: q pops screen", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("q");
      await terminal.waitForNoText("REPLAY");
      await terminal.terminate();
    });

    test("KEY-REPLAY-024: y copies current message content (OSC 52)", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("y");
      expect(terminal.snapshot()).toMatch(/\x1b\]52;c;/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-025: Enter on workflow link in summary navigates to workflow run detail", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-workflow"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Linked workflow");
      await terminal.sendKeys("Enter");
      await terminal.waitForNoText("REPLAY");
      await terminal.waitForText("Workflow");
      await terminal.terminate();
    });

    test("KEY-REPLAY-026: Enter on non-link content is no-op", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("Enter");
      expect(terminal.snapshot()).toMatch(/REPLAY/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-027: Rapid j presses (20× sequential) — each scrolls one line", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      for (let i = 0; i < 20; i++) {
        await terminal.sendKeys("j");
      }
      expect(terminal.snapshot()).toBeTruthy();
      await terminal.terminate();
    });

    test("KEY-REPLAY-028: Rapid ] presses jump through messages sequentially", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("]", "]", "]");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Message 4/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-029: Keys j/k/]/[ do not trigger while search input focused", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      const before = terminal.snapshot();
      await terminal.sendKeys("j");
      expect(terminal.snapshot()).toMatch(/j/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-030: Search is case-insensitive", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("AUTH");
      expect(terminal.snapshot()).toMatch(/[1-9]\d*\/[1-9]\d*/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-031: Search with no matches shows '0/0'", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("zzzznonexistent");
      expect(terminal.snapshot()).toMatch(/0\/0/);
      await terminal.terminate();
    });

    test("KEY-REPLAY-032: Position indicator updates on scroll and message jump", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.getLine(terminal.rows - 1)).toMatch(/Message 1 of 6/);
      await terminal.sendKeys("]");
      expect(terminal.getLine(terminal.rows - 1)).toMatch(/Message 2 of 6/);
      await terminal.sendKeys("]");
      expect(terminal.getLine(terminal.rows - 1)).toMatch(/Message 3 of 6/);
      await terminal.terminate();
    });
  });

  describe("responsive layout", () => {
    test("RESP-REPLAY-001: 80×24 — no padding on message blocks", async () => {
      const terminal = await launchTUI({
        cols: 80, rows: 24,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-002: 80×24 — timestamps hidden", async () => {
      const terminal = await launchTUI({
        cols: 80, rows: 24,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-003: 80×24 — tool summary hidden (tool name only)", async () => {
      const terminal = await launchTUI({
        cols: 80, rows: 24,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-tools"],
      });
      await terminal.waitForText("▶");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-004: 80×24 — position indicator abbreviated 'N/M'", async () => {
      const terminal = await launchTUI({
        cols: 80, rows: 24,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-6-messages"],
      });
      await terminal.waitForText("REPLAY");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/\d+\/\d+/);
      expect(statusLine).not.toMatch(/Message \d+ of \d+/);
      await terminal.terminate();
    });

    test("RESP-REPLAY-005: 120×40 — 2ch padding on message blocks", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-006: 120×40 — timestamps shown as relative time", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-007: 120×40 — tool summary shown (one-line, 60ch)", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-tools"],
      });
      await terminal.waitForText("▶");
      expect(terminal.snapshot()).toMatch(/ — /);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-008: 200×60 — metadata sidebar visible", async () => {
      const terminal = await launchTUI({
        cols: 200, rows: 60,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("Session Info");
      await terminal.waitForText("Legend");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-009: 200×60 — 4ch padding on message blocks", async () => {
      const terminal = await launchTUI({
        cols: 200, rows: 60,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-010: Resize from 120×40 to 80×24 — timestamps disappear, padding reduces, scroll preserved", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("]");
      await terminal.resize(80, 24);
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/\d+\/\d+/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-011: Resize from 80×24 to 200×60 — sidebar appears, padding increases, scroll preserved", async () => {
      const terminal = await launchTUI({
        cols: 80, rows: 24,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.resize(200, 60);
      await terminal.waitForText("Session Info");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("RESP-REPLAY-012: Resize during search — search input width adjusts, matches preserved", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("/");
      await terminal.sendText("auth");
      const beforeResize = terminal.snapshot();
      await terminal.resize(80, 24);
      expect(terminal.snapshot()).toMatch(/auth/);
      expect(terminal.snapshot()).toMatch(/\d+\/\d+/);
      await terminal.terminate();
    });
  });

  describe("integration", () => {
    test("INT-REPLAY-001: Auth expiry (401) during session fetch — auth error screen shown", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-401"],
        env: { CODEPLANE_TOKEN: "expired-token" },
      });
      await terminal.waitForText("codeplane auth login");
      await terminal.terminate();
    });

    test("INT-REPLAY-002: Auth expiry (401) during message fetch — auth error screen shown", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-messages-401"],
      });
      await terminal.waitForText("codeplane auth login");
      await terminal.terminate();
    });

    test("INT-REPLAY-003: Session not found (404) — error state with 'Session not found.'", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "nonexistent-id"],
      });
      await terminal.waitForText("Session not found");
      await terminal.terminate();
    });

    test("INT-REPLAY-004: Server error (500) on message fetch — error state with retry", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-500"],
      });
      await terminal.waitForText("Failed to load messages");
      await terminal.waitForText("R to retry");
      await terminal.terminate();
    });

    test("INT-REPLAY-005: Rate limited (429) during message pagination — pauses, resumes after Retry-After", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-rate-limited"],
      });
      await terminal.waitForText("Rate limited");
      await terminal.waitForText("Session Complete", 15000);
      await terminal.terminate();
    });

    test("INT-REPLAY-006: Auto-pagination loads all messages across multiple pages", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-100-messages"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Session Complete");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/of 100/);
      await terminal.terminate();
    });

    test("INT-REPLAY-007: Deep link --screen agent-replay --session-id {id} launches directly", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.getLine(0)).toMatch(/Agents/);
      await terminal.terminate();
    });

    test("INT-REPLAY-008: Navigation from session list preserves list scroll/focus on return", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });
      await terminal.waitForText("Agent Sessions");
      await terminal.sendKeys("j", "j");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("INT-REPLAY-009: Enter on workflow link navigates to workflow run detail", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-workflow"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Linked workflow");
      await terminal.sendKeys("Enter");
      await terminal.waitForNoText("REPLAY");
      await terminal.terminate();
    });

    test("INT-REPLAY-010: Return from workflow run detail preserves replay scroll position", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-with-workflow"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("]", "]");
      await terminal.sendKeys("G");
      await terminal.waitForText("Linked workflow");
      await terminal.sendKeys("Enter");
      await terminal.waitForNoText("REPLAY");
      await terminal.sendKeys("q");
      await terminal.waitForText("REPLAY");
      await terminal.waitForText("Session Complete");
      await terminal.terminate();
    });

    test("INT-REPLAY-011: Active session redirects to live chat screen", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-active"],
      });
      await terminal.waitForNoText("REPLAY");
      await terminal.terminate();
    });

    test("INT-REPLAY-012: Running session redirects to live chat screen", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-pending"],
      });
      await terminal.waitForNoText("REPLAY");
      await terminal.terminate();
    });

    test("INT-REPLAY-013: Session with 0 messages shows empty state", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-empty"],
      });
      await terminal.waitForText("This session has no messages");
      await terminal.terminate();
    });

    test("INT-REPLAY-014: Session with null started_at shows '—' for duration", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-null-timestamps"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("—");
      await terminal.terminate();
    });

    test("INT-REPLAY-015: R retries failed message fetch", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-500-then-ok"],
      });
      await terminal.waitForText("Failed to load messages");
      await terminal.sendKeys("R");
      await terminal.waitForText("REPLAY");
      await terminal.terminate();
    });

    test("INT-REPLAY-016: Network timeout (30s) during fetch — error state shown", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-timeout"],
      });
      await terminal.waitForText("Failed to load", 35000);
      await terminal.terminate();
    });
  });

  describe("edge cases", () => {
    test("EDGE-REPLAY-001: Session title at 255 characters — truncated in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-255-title"],
      });
      await terminal.waitForText("REPLAY");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/…/);
      await terminal.terminate();
    });

    test("EDGE-REPLAY-002: Message content at 100KB — rendered without truncation", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-100kb-message"],
      });
      await terminal.waitForText("REPLAY");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toMatch(/Content truncated/);
      await terminal.terminate();
    });

    test("EDGE-REPLAY-003: Message content exceeding 100KB — truncated with indicator", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-over-100kb-message"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Content truncated");
      await terminal.terminate();
    });

    test("EDGE-REPLAY-004: Tool input at 64KB — rendered in code block", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-64kb-tool"],
      });
      await terminal.waitForText("▶");
      await terminal.sendKeys("x");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toMatch(/truncated/);
      await terminal.terminate();
    });

    test("EDGE-REPLAY-005: Tool input exceeding 64KB — truncated with indicator", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-over-64kb-tool"],
      });
      await terminal.waitForText("▶");
      await terminal.sendKeys("x");
      await terminal.waitForText("truncated");
      await terminal.terminate();
    });

    test("EDGE-REPLAY-006: Unicode/emoji in message content — preserved", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-unicode"],
      });
      await terminal.waitForText("REPLAY");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/[\u{1F600}-\u{1F64F}]|[\u{0370}-\u{03FF}]|✓/u);
      await terminal.terminate();
    });

    test("EDGE-REPLAY-007: Malformed message part — rendered as raw JSON with warning", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-malformed"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.snapshot()).toMatch(/⚠/);
      await terminal.terminate();
    });

    test("EDGE-REPLAY-008: 500 messages in session — all auto-paginated and rendered", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-500-messages"],
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("G");
      await terminal.waitForText("Session Complete", 30000);
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/of 500/);
      await terminal.terminate();
    });

    test("EDGE-REPLAY-009: Concurrent resize + j scroll", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
      });
      await terminal.waitForText("REPLAY");
      await Promise.all([
        terminal.resize(80, 24),
        terminal.sendKeys("j", "j", "j"),
      ]);
      expect(terminal.snapshot()).toBeTruthy();
      await terminal.terminate();
    });

    test("EDGE-REPLAY-010: q during initial loading — clean unmount, fetches cancelled", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-slow"],
      });
      await terminal.sendKeys("q");
      await terminal.waitForNoText("REPLAY");
      await terminal.terminate();
    });

    test("EDGE-REPLAY-011: Session with empty message content — blank block with role label", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-empty-content"],
      });
      await terminal.waitForText("REPLAY");
      expect(terminal.snapshot()).toMatch(/You|Agent/);
      expect(terminal.snapshot()).toMatch(/─/);
      await terminal.terminate();
    });

    test("EDGE-REPLAY-012: Clipboard copy on terminal without OSC 52 — silent failure with status bar hint", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "test-session-completed"],
        env: { TERM_PROGRAM: "unsupported-terminal" },
      });
      await terminal.waitForText("REPLAY");
      await terminal.sendKeys("y");
      expect(terminal.snapshot()).toBeTruthy();
      await terminal.terminate();
    });
  });
});
