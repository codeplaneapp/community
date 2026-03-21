import { describe, test, expect } from "bun:test";
import {
  getRunStatusIcon,
  getRunStatusIconNoColor,
  getStepStatusIcon,
  getStepStatusIconNoColor,
  formatDuration,
  getDurationColor,
  formatRelativeTime,
  getMiniStatusBar,
  formatBytes,
  abbreviateSHA,
  formatRunCount,
  type WorkflowStatusIcon,
  type MiniRun,
} from "../../apps/tui/src/screens/Workflows/utils.js";

describe("getRunStatusIcon", () => {
  test("UTIL-RSI-001: success returns green check icon", () => {
    const result = getRunStatusIcon("success");
    expect(result.icon).toBe("✓");
    expect(result.color).toBe("success");
    expect(result.fallback).toBe("[OK]");
    expect(result.bold).toBe(false);
    expect(result.label).toBe("Success");
  });

  test("UTIL-RSI-002: failure returns red X icon with bold", () => {
    const result = getRunStatusIcon("failure");
    expect(result.icon).toBe("✗");
    expect(result.color).toBe("error");
    expect(result.bold).toBe(true);
    expect(result.label).toBe("Failure");
  });

  test("UTIL-RSI-003: running returns yellow circle with bold", () => {
    const result = getRunStatusIcon("running");
    expect(result.icon).toBe("◎");
    expect(result.color).toBe("warning");
    expect(result.bold).toBe(true);
    expect(result.label).toBe("Running");
  });

  test("UTIL-RSI-004: queued returns cyan open circle", () => {
    const result = getRunStatusIcon("queued");
    expect(result.icon).toBe("◌");
    expect(result.color).toBe("primary");
    expect(result.bold).toBe(false);
    expect(result.label).toBe("Queued");
  });

  test("UTIL-RSI-005: cancelled returns muted X mark", () => {
    const result = getRunStatusIcon("cancelled");
    expect(result.icon).toBe("✕");
    expect(result.color).toBe("muted");
    expect(result.bold).toBe(false);
    expect(result.label).toBe("Cancelled");
  });

  test("UTIL-RSI-006: error returns red warning triangle with bold", () => {
    const result = getRunStatusIcon("error");
    expect(result.icon).toBe("⚠");
    expect(result.color).toBe("error");
    expect(result.bold).toBe(true);
    expect(result.label).toBe("Error");
  });

  test("UTIL-RSI-007: all run statuses have distinct icons", () => {
    const statuses = ["success", "failure", "running", "queued", "cancelled", "error"] as const;
    const icons = statuses.map(s => getRunStatusIcon(s).icon);
    expect(new Set(icons).size).toBe(statuses.length);
  });

  test("UTIL-RSI-008: all run statuses have distinct fallbacks", () => {
    const statuses = ["success", "failure", "running", "queued", "cancelled", "error"] as const;
    const fallbacks = statuses.map(s => getRunStatusIcon(s).fallback);
    expect(new Set(fallbacks).size).toBe(statuses.length);
  });
});

describe("getStepStatusIcon", () => {
  test("UTIL-SSI-001: success step returns green check", () => {
    const result = getStepStatusIcon("success");
    expect(result.icon).toBe("✓");
    expect(result.color).toBe("success");
  });

  test("UTIL-SSI-002: failure step returns red X with bold", () => {
    const result = getStepStatusIcon("failure");
    expect(result.icon).toBe("✗");
    expect(result.color).toBe("error");
    expect(result.bold).toBe(true);
  });

  test("UTIL-SSI-003: running step returns yellow circle", () => {
    const result = getStepStatusIcon("running");
    expect(result.icon).toBe("◎");
    expect(result.color).toBe("warning");
  });

  test("UTIL-SSI-004: pending step returns muted open circle", () => {
    const result = getStepStatusIcon("pending");
    expect(result.icon).toBe("◌");
    expect(result.color).toBe("muted");
  });

  test("UTIL-SSI-005: skipped step returns muted circle slash", () => {
    const result = getStepStatusIcon("skipped");
    expect(result.icon).toBe("⊘");
    expect(result.color).toBe("muted");
  });

  test("UTIL-SSI-006: unknown status returns question mark with muted color", () => {
    const result = getStepStatusIcon("some_unknown_status");
    expect(result.icon).toBe("?");
    expect(result.color).toBe("muted");
    expect(result.label).toBe("some_unknown_status");
  });

  test("UTIL-SSI-007: case insensitive lookup", () => {
    const result = getStepStatusIcon("SUCCESS");
    expect(result.icon).toBe("✓");
    expect(result.color).toBe("success");
  });

  test("UTIL-SSI-008: empty string returns unknown fallback", () => {
    const result = getStepStatusIcon("");
    expect(result.icon).toBe("?");
    expect(result.color).toBe("muted");
  });
});

describe("getRunStatusIconNoColor", () => {
  test("UTIL-NC-001: no-color variant preserves icon and label but overrides color", () => {
    const result = getRunStatusIconNoColor("success");
    expect(result.icon).toBe("✓");
    expect(result.label).toBe("Success");
    expect(result.color).toBe("muted");
    expect(result.bold).toBe(false);
  });

  test("UTIL-NC-002: no-color variant for failure removes bold", () => {
    const result = getRunStatusIconNoColor("failure");
    expect(result.bold).toBe(false);
    expect(result.color).toBe("muted");
  });

  test("UTIL-NC-003: all no-color statuses use muted color", () => {
    const statuses = ["success", "failure", "running", "queued", "cancelled", "error"] as const;
    for (const s of statuses) {
      expect(getRunStatusIconNoColor(s).color).toBe("muted");
    }
  });
});

describe("getStepStatusIconNoColor", () => {
  test("UTIL-NC-004: step no-color variant overrides color to muted", () => {
    const result = getStepStatusIconNoColor("failure");
    expect(result.icon).toBe("✗");
    expect(result.color).toBe("muted");
    expect(result.bold).toBe(false);
  });
});

describe("formatDuration", () => {
  test("UTIL-FD-001: null returns em dash", () => {
    expect(formatDuration(null)).toBe("—");
  });

  test("UTIL-FD-002: undefined returns em dash", () => {
    expect(formatDuration(undefined)).toBe("—");
  });

  test("UTIL-FD-003: zero returns 0s", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  test("UTIL-FD-004: seconds under 60 use s suffix", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  test("UTIL-FD-005: 60 seconds formats as 1m 0s", () => {
    expect(formatDuration(60)).toBe("1m 0s");
  });

  test("UTIL-FD-006: mixed minutes and seconds", () => {
    expect(formatDuration(83)).toBe("1m 23s");
  });

  test("UTIL-FD-007: 3600 seconds formats as 1h 0m", () => {
    expect(formatDuration(3600)).toBe("1h 0m");
  });

  test("UTIL-FD-008: mixed hours and minutes", () => {
    expect(formatDuration(7500)).toBe("2h 5m");
  });

  test("UTIL-FD-009: negative returns em dash", () => {
    expect(formatDuration(-1)).toBe("—");
  });

  test("UTIL-FD-010: NaN returns em dash", () => {
    expect(formatDuration(NaN)).toBe("—");
  });

  test("UTIL-FD-011: Infinity returns em dash", () => {
    expect(formatDuration(Infinity)).toBe("—");
  });

  test("UTIL-FD-012: fractional seconds are floored", () => {
    expect(formatDuration(45.9)).toBe("45s");
  });

  test("UTIL-FD-013: large value 86400s = 24h 0m", () => {
    expect(formatDuration(86400)).toBe("24h 0m");
  });
});

describe("getDurationColor", () => {
  test("UTIL-DC-001: null returns muted", () => {
    expect(getDurationColor(null)).toBe("muted");
  });

  test("UTIL-DC-002: under 60s returns success", () => {
    expect(getDurationColor(30)).toBe("success");
  });

  test("UTIL-DC-003: 60–299s returns muted", () => {
    expect(getDurationColor(120)).toBe("muted");
  });

  test("UTIL-DC-004: 300–899s returns warning", () => {
    expect(getDurationColor(600)).toBe("warning");
  });

  test("UTIL-DC-005: 900+ returns error", () => {
    expect(getDurationColor(1200)).toBe("error");
  });

  test("UTIL-DC-006: boundary at 59 returns success", () => {
    expect(getDurationColor(59)).toBe("success");
  });

  test("UTIL-DC-007: boundary at 60 returns muted", () => {
    expect(getDurationColor(60)).toBe("muted");
  });

  test("UTIL-DC-008: boundary at 299 returns muted", () => {
    expect(getDurationColor(299)).toBe("muted");
  });

  test("UTIL-DC-009: boundary at 300 returns warning", () => {
    expect(getDurationColor(300)).toBe("warning");
  });

  test("UTIL-DC-010: boundary at 899 returns warning", () => {
    expect(getDurationColor(899)).toBe("warning");
  });

  test("UTIL-DC-011: boundary at 900 returns error", () => {
    expect(getDurationColor(900)).toBe("error");
  });

  test("UTIL-DC-012: zero returns success", () => {
    expect(getDurationColor(0)).toBe("success");
  });

  test("UTIL-DC-013: negative returns muted", () => {
    expect(getDurationColor(-5)).toBe("muted");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-03-22T12:00:00Z");

  test("UTIL-RT-001: null returns em dash", () => {
    expect(formatRelativeTime(null, now)).toBe("—");
  });

  test("UTIL-RT-002: undefined returns em dash", () => {
    expect(formatRelativeTime(undefined, now)).toBe("—");
  });

  test("UTIL-RT-003: 30 seconds ago returns now", () => {
    expect(formatRelativeTime("2026-03-22T11:59:30Z", now)).toBe("now");
  });

  test("UTIL-RT-004: 5 minutes ago returns 5m", () => {
    expect(formatRelativeTime("2026-03-22T11:55:00Z", now)).toBe("5m");
  });

  test("UTIL-RT-005: 3 hours ago returns 3h", () => {
    expect(formatRelativeTime("2026-03-22T09:00:00Z", now)).toBe("3h");
  });

  test("UTIL-RT-006: 3 days ago returns 3d", () => {
    expect(formatRelativeTime("2026-03-19T12:00:00Z", now)).toBe("3d");
  });

  test("UTIL-RT-007: 10 days ago returns 1w", () => {
    expect(formatRelativeTime("2026-03-12T12:00:00Z", now)).toBe("1w");
  });

  test("UTIL-RT-008: 60 days ago returns 2mo", () => {
    expect(formatRelativeTime("2026-01-21T12:00:00Z", now)).toBe("2mo");
  });

  test("UTIL-RT-009: 400 days ago returns 1y", () => {
    expect(formatRelativeTime("2025-02-15T12:00:00Z", now)).toBe("1y");
  });

  test("UTIL-RT-010: future timestamp returns now", () => {
    expect(formatRelativeTime("2026-03-23T12:00:00Z", now)).toBe("now");
  });

  test("UTIL-RT-011: invalid ISO string returns em dash", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("—");
  });

  test("UTIL-RT-012: empty string returns em dash", () => {
    expect(formatRelativeTime("", now)).toBe("—");
  });
});

describe("getMiniStatusBar", () => {
  test("UTIL-MSB-001: empty array returns 5 muted dots", () => {
    const result = getMiniStatusBar([]);
    expect(result).toHaveLength(5);
    expect(result.every(s => s.char === "·" && s.color === "muted")).toBe(true);
  });

  test("UTIL-MSB-002: single success run pads remaining with dots", () => {
    const result = getMiniStatusBar([{ status: "success" }]);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ char: "●", color: "success" });
    expect(result[1].char).toBe("·");
  });

  test("UTIL-MSB-003: 5 runs fills all slots", () => {
    const runs: MiniRun[] = [
      { status: "success" },
      { status: "failure" },
      { status: "running" },
      { status: "queued" },
      { status: "cancelled" },
    ];
    const result = getMiniStatusBar(runs);
    expect(result).toHaveLength(5);
    expect(result[0].color).toBe("success");
    expect(result[1].color).toBe("error");
    expect(result[2].color).toBe("warning");
    expect(result[3].color).toBe("primary");
    expect(result[4].color).toBe("muted");
  });

  test("UTIL-MSB-004: more than 5 runs truncates to first 5", () => {
    const runs: MiniRun[] = Array.from({ length: 10 }, () => ({ status: "success" as const }));
    const result = getMiniStatusBar(runs);
    expect(result).toHaveLength(5);
  });

  test("UTIL-MSB-005: running status uses double circle character", () => {
    const result = getMiniStatusBar([{ status: "running" }]);
    expect(result[0].char).toBe("◎");
  });

  test("UTIL-MSB-006: queued status uses open circle character", () => {
    const result = getMiniStatusBar([{ status: "queued" }]);
    expect(result[0].char).toBe("○");
  });
});

describe("formatBytes", () => {
  test("UTIL-FB-001: null returns em dash", () => {
    expect(formatBytes(null)).toBe("—");
  });

  test("UTIL-FB-002: 0 returns 0 B", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  test("UTIL-FB-003: 89 bytes returns 89 B", () => {
    expect(formatBytes(89)).toBe("89 B");
  });

  test("UTIL-FB-004: 1024 returns 1.0 KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  test("UTIL-FB-005: large KB value drops decimal", () => {
    expect(formatBytes(345 * 1024)).toBe("345 KB");
  });

  test("UTIL-FB-006: small MB shows decimal", () => {
    expect(formatBytes(2.1 * 1024 * 1024)).toBe("2.1 MB");
  });

  test("UTIL-FB-007: GB range formats correctly", () => {
    expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe("1.2 GB");
  });

  test("UTIL-FB-008: negative returns em dash", () => {
    expect(formatBytes(-100)).toBe("—");
  });

  test("UTIL-FB-009: NaN returns em dash", () => {
    expect(formatBytes(NaN)).toBe("—");
  });

  test("UTIL-FB-010: very large value uses TB", () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024 * 1024)).toBe("2.0 TB");
  });
});

describe("abbreviateSHA", () => {
  test("UTIL-SHA-001: 40-char SHA truncates to 7", () => {
    expect(abbreviateSHA("abc1234def5678901234567890abcdef12345678")).toBe("abc1234");
  });

  test("UTIL-SHA-002: null returns em dash", () => {
    expect(abbreviateSHA(null)).toBe("—");
  });

  test("UTIL-SHA-003: undefined returns em dash", () => {
    expect(abbreviateSHA(undefined)).toBe("—");
  });

  test("UTIL-SHA-004: empty string returns em dash", () => {
    expect(abbreviateSHA("")).toBe("—");
  });

  test("UTIL-SHA-005: short string returned as-is", () => {
    expect(abbreviateSHA("abc")).toBe("abc");
  });

  test("UTIL-SHA-006: exactly 7 chars returned unchanged", () => {
    expect(abbreviateSHA("abcdefg")).toBe("abcdefg");
  });
});

describe("formatRunCount", () => {
  test("UTIL-RC-001: null returns 0", () => {
    expect(formatRunCount(null)).toBe("0");
  });

  test("UTIL-RC-002: zero returns 0", () => {
    expect(formatRunCount(0)).toBe("0");
  });

  test("UTIL-RC-003: under 1000 returns plain number", () => {
    expect(formatRunCount(42)).toBe("42");
  });

  test("UTIL-RC-004: 999 returns 999 (no K)", () => {
    expect(formatRunCount(999)).toBe("999");
  });

  test("UTIL-RC-005: 1000 returns 1.0K", () => {
    expect(formatRunCount(1000)).toBe("1.0K");
  });

  test("UTIL-RC-006: 1500 returns 1.5K", () => {
    expect(formatRunCount(1500)).toBe("1.5K");
  });

  test("UTIL-RC-007: 10000 returns 10K", () => {
    expect(formatRunCount(10000)).toBe("10K");
  });

  test("UTIL-RC-008: undefined returns 0", () => {
    expect(formatRunCount(undefined)).toBe("0");
  });
});
