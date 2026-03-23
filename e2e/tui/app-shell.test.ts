import { describe, test, expect } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { TUI_ROOT, TUI_SRC, BUN, run, bunEval, createTestCredentialStore, createMockAPIEnv, launchTUI } from "./helpers.ts"

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Package scaffold
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Package scaffold", () => {
  test("package.json exists and declares correct name", async () => {
    const pkgPath = join(TUI_ROOT, "package.json")
    expect(existsSync(pkgPath)).toBe(true)
    const pkg = await Bun.file(pkgPath).json()
    expect(pkg.name).toBe("@codeplane/tui")
    expect(pkg.type).toBe("module")
    expect(pkg.private).toBe(true)
  })

  test("package.json pins @opentui/core at exact version", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    const version = pkg.dependencies["@opentui/core"]
    expect(version).toBeDefined()
    // Must be exact-pinned (no ^ or ~ prefix) per architecture principle
    expect(version).toBe("0.1.90")
  })

  test("package.json pins @opentui/react at exact version", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    const version = pkg.dependencies["@opentui/react"]
    expect(version).toBeDefined()
    expect(version).toBe("0.1.90")
  })

  test("package.json pins react 19.x at exact version", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    const reactVersion = pkg.dependencies["react"]
    expect(reactVersion).toBeDefined()
    // Must be exact 19.x.x (no caret) — rendering-critical dependency
    expect(reactVersion).toMatch(/^19\.\d+\.\d+$/)
  })

  test("package.json declares @codeplane/sdk workspace dependency", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.dependencies["@codeplane/sdk"]).toBe("workspace:*")
  })

  test("package.json has typescript dev dependency", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.devDependencies["typescript"]).toBeDefined()
  })

  test("package.json has @types/react dev dependency", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.devDependencies["@types/react"]).toBeDefined()
  })

  test("package.json has bun-types dev dependency", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.devDependencies["bun-types"]).toBeDefined()
  })

  test("package.json has check script that runs tsc --noEmit", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.scripts?.check).toBe("tsc --noEmit")
  })

  test("tsconfig.json exists and configures OpenTUI JSX import source", async () => {
    const tsconfigPath = join(TUI_ROOT, "tsconfig.json")
    expect(existsSync(tsconfigPath)).toBe(true)
    const content = await Bun.file(tsconfigPath).text()
    // Verify the critical JSX configuration
    expect(content).toContain('"jsxImportSource"')
    expect(content).toContain("@opentui/react")
    expect(content).toContain('"react-jsx"')
  })

  test("tsconfig.json configures bun-types", async () => {
    const content = await Bun.file(join(TUI_ROOT, "tsconfig.json")).text()
    expect(content).toContain("bun-types")
  })

  test("tsconfig.json does not include DOM lib", async () => {
    const content = await Bun.file(join(TUI_ROOT, "tsconfig.json")).text()
    // TUI runs in a terminal, not a browser — no DOM types
    expect(content).not.toMatch(/"DOM"/)
  })

  test("tsconfig.json uses isolatedModules for Bun compatibility", async () => {
    const content = await Bun.file(join(TUI_ROOT, "tsconfig.json")).text()
    expect(content).toContain("isolatedModules")
  })

  test("entry point exists at src/index.tsx", () => {
    expect(existsSync(join(TUI_SRC, "index.tsx"))).toBe(true)
  })

  test("verify-imports.ts exists for dependency chain validation", () => {
    expect(existsSync(join(TUI_SRC, "verify-imports.ts"))).toBe(true)
  })

  test("providers directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "providers/index.ts"))).toBe(true)
  })

  test("components directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "components/index.ts"))).toBe(true)
  })

  test("hooks directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "hooks/index.ts"))).toBe(true)
  })

  test("theme directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "theme/index.ts"))).toBe(true)
  })

  test("screens directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "screens/index.ts"))).toBe(true)
  })

  test("lib directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "lib/index.ts"))).toBe(true)
  })

  test("util directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "util/index.ts"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — TypeScript compilation
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — TypeScript compilation", () => {
  test("tsc --noEmit passes with zero errors", async () => {
    const result = await run(["bun", "run", "check"])
    if (result.exitCode !== 0) {
      // Print diagnostic output for debugging
      console.error("tsc stderr:", result.stderr)
      console.error("tsc stdout:", result.stdout)
    }
    expect(result.exitCode).toBe(0)
  }, 30_000)

  test("existing diff-syntax code compiles under new tsconfig", async () => {
    const result = await run(["bun", "run", "check"])
    expect(result.exitCode).toBe(0)
  }, 30_000)

  test("existing Agent screen code compiles under new tsconfig", async () => {
    const result = await run(["bun", "run", "check"])
    expect(result.exitCode).toBe(0)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Dependency resolution
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Dependency resolution", () => {
  test("@opentui/core is resolvable at runtime", async () => {
    const result = await bunEval(
      "import('@opentui/core').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  test("@opentui/react is resolvable at runtime", async () => {
    const result = await bunEval(
      "import('@opentui/react').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  test("createCliRenderer is importable from @opentui/core and is a function", async () => {
    const result = await bunEval(
      "import { createCliRenderer } from '@opentui/core'; console.log(typeof createCliRenderer)",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("function")
  })

  test("createRoot is importable from @opentui/react and is a function", async () => {
    const result = await bunEval(
      "import { createRoot } from '@opentui/react'; console.log(typeof createRoot)",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("function")
  })

  test("OpenTUI React hooks are importable", async () => {
    const result = await bunEval(
      [
        "import { useKeyboard, useTerminalDimensions, useOnResize, useTimeline, useRenderer } from '@opentui/react';",
        "const types = [typeof useKeyboard, typeof useTerminalDimensions, typeof useOnResize, typeof useTimeline, typeof useRenderer];",
        "console.log(types.every(t => t === 'function') ? 'ok' : 'fail: ' + types.join(','));",
      ].join(" "),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  test("react 19.x is resolvable with correct major version", async () => {
    const result = await bunEval(
      "import React from 'react'; console.log(React.version)",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^19\./)
  })

  test("@codeplane/sdk is resolvable via workspace protocol", async () => {
    const result = await bunEval(
      "import('@codeplane/sdk').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })
})

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — E2E test infrastructure
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — E2E test infrastructure", () => {
  test("createTestCredentialStore creates valid credential file", () => {
    const creds = createTestCredentialStore("test-token-123")
    try {
      const content = JSON.parse(readFileSync(creds.path, "utf-8"))
      expect(content.version).toBe(1)
      expect(content.tokens).toBeArray()
      expect(content.tokens[0].token).toBe("test-token-123")
      expect(content.tokens[0].host).toBe("localhost")
      expect(creds.token).toBe("test-token-123")
    } finally {
      creds.cleanup()
    }
  })

  test("createTestCredentialStore generates random token when none provided", () => {
    const creds = createTestCredentialStore()
    try {
      expect(creds.token).toMatch(/^codeplane_test_/)
      const content = JSON.parse(readFileSync(creds.path, "utf-8"))
      expect(content.tokens[0].token).toBe(creds.token)
    } finally {
      creds.cleanup()
    }
  })

  test("createTestCredentialStore cleanup removes files", () => {
    const creds = createTestCredentialStore()
    const path = creds.path
    creds.cleanup()
    expect(existsSync(path)).toBe(false)
  })

  test("createMockAPIEnv returns correct default values", () => {
    const env = createMockAPIEnv()
    expect(env.CODEPLANE_API_URL).toBe("http://localhost:13370")
    expect(env.CODEPLANE_TOKEN).toBe("test-token-for-e2e")
    expect(env.CODEPLANE_DISABLE_SSE).toBeUndefined()
  })

  test("createMockAPIEnv respects custom options", () => {
    const env = createMockAPIEnv({
      apiBaseUrl: "http://custom:9999",
      token: "custom-token",
      disableSSE: true,
    })
    expect(env.CODEPLANE_API_URL).toBe("http://custom:9999")
    expect(env.CODEPLANE_TOKEN).toBe("custom-token")
    expect(env.CODEPLANE_DISABLE_SSE).toBe("1")
  })

  test("launchTUI is a function", () => {
    expect(typeof launchTUI).toBe("function")
  })

  test("@microsoft/tui-test is importable", async () => {
    const result = await bunEval(
      "import('@microsoft/tui-test').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  test("TUITestInstance interface matches expected shape", async () => {
    const result = await bunEval([
      "import type { TUITestInstance } from '../../e2e/tui/helpers.ts';",
      "const check: TUITestInstance = {} as TUITestInstance;",
      "const methods: (keyof TUITestInstance)[] = [",
      "  'sendKeys', 'sendText', 'waitForText', 'waitForNoText',",
      "  'snapshot', 'getLine', 'resize', 'terminate', 'rows', 'cols',",
      "];",
      "console.log(methods.length);",
    ].join(" "))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("10")
  })

  test("TERMINAL_SIZES matches design.md breakpoints", async () => {
    const { TERMINAL_SIZES: sizes } = await import("./helpers.ts")
    expect(sizes.minimum).toEqual({ width: 80, height: 24 })
    expect(sizes.standard).toEqual({ width: 120, height: 40 })
    expect(sizes.large).toEqual({ width: 200, height: 60 })
  })
})


// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Color capability detection (theme/detect.ts)
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Color capability detection", () => {

  // ── File structure ─────────────────────────────────────────────────────

  test("DET-FILE-001: theme/detect.ts exists", () => {
    expect(existsSync(join(TUI_SRC, "theme/detect.ts"))).toBe(true);
  });

  test("DET-FILE-002: theme/index.ts re-exports detectColorCapability", async () => {
    const result = await bunEval(
      "import { detectColorCapability } from './src/theme/index.js'; console.log(typeof detectColorCapability)"
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("DET-FILE-003: theme/index.ts re-exports isUnicodeSupported", async () => {
    const result = await bunEval(
      "import { isUnicodeSupported } from './src/theme/index.js'; console.log(typeof isUnicodeSupported)"
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("DET-FILE-004: theme/index.ts re-exports ColorTier type", async () => {
    // Type-only exports are erased at runtime; verify the module loads
    // and that the value-level exports coexist with the type export.
    const result = await bunEval(
      "import { detectColorCapability } from './src/theme/index.js'; const t: import('./src/theme/detect.js').ColorTier = detectColorCapability(); console.log(typeof t)"
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("string");
  });

  test("DET-FILE-005: detect.ts has zero React imports", async () => {
    const content = await Bun.file(join(TUI_SRC, "theme/detect.ts")).text();
    expect(content).not.toContain("from 'react'");
    expect(content).not.toContain('from "react"');
    expect(content).not.toContain("import React");
  });

  test("DET-FILE-006: detect.ts has zero @opentui imports", async () => {
    const content = await Bun.file(join(TUI_SRC, "theme/detect.ts")).text();
    expect(content).not.toContain("@opentui");
  });

  // ── detectColorCapability() ────────────────────────────────────────────

  // Priority 1: NO_COLOR
  test("DET-DETECT-001: NO_COLOR=1 returns ansi16 even with truecolor COLORTERM", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "1", COLORTERM: "truecolor", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi16");
  });

  test("DET-DETECT-002: NO_COLOR=0 (non-empty) returns ansi16", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "0", COLORTERM: "", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi16");
  });

  test("DET-DETECT-003: NO_COLOR='' (empty string) does NOT trigger ansi16", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "truecolor", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor");
  });

  // Priority 2: TERM=dumb
  test("DET-DETECT-004: TERM=dumb returns ansi16 even with truecolor COLORTERM", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", TERM: "dumb", COLORTERM: "truecolor" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi16");
  });

  // Priority 3: COLORTERM=truecolor
  test("DET-DETECT-005: COLORTERM=truecolor returns truecolor", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "truecolor", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor");
  });

  test("DET-DETECT-006: COLORTERM=24bit returns truecolor", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "24bit", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor");
  });

  test("DET-DETECT-007: COLORTERM is case-insensitive (TrueColor)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "TrueColor", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor");
  });

  // Priority 4: TERM contains 256color
  test("DET-DETECT-008: TERM=xterm-256color returns ansi256", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-009: TERM=screen-256color returns ansi256", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "screen-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-010: TERM=tmux-256color returns ansi256", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "tmux-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-011: TERM is case-insensitive (XTERM-256COLOR)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "XTERM-256COLOR" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  // Priority 5: Default fallback
  test("DET-DETECT-012: no env vars returns ansi256 (default)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-013: TERM=xterm (no 256) returns ansi256 (default)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "xterm" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-014: TERM=linux returns ansi256 (default)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "linux" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-015: empty TERM returns ansi256 (default)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  // Return type validation
  test("DET-DETECT-016: return value is always one of the three valid tiers", async () => {
    const envCombos = [
      { NO_COLOR: "1", COLORTERM: "", TERM: "" },
      { NO_COLOR: "", COLORTERM: "", TERM: "dumb" },
      { NO_COLOR: "", COLORTERM: "truecolor", TERM: "" },
      { NO_COLOR: "", COLORTERM: "", TERM: "xterm-256color" },
      { NO_COLOR: "", COLORTERM: "", TERM: "" },
      { NO_COLOR: "", COLORTERM: "", TERM: "rxvt-unicode" },
    ];
    for (const env of envCombos) {
      const r = await run(
        [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; const t = detectColorCapability(); console.log(['truecolor','ansi256','ansi16'].includes(t))"],
        { env }
      );
      expect(r.exitCode).toBe(0);
      expect(r.stdout.trim()).toBe("true");
    }
  });

  // ── isUnicodeSupported() ───────────────────────────────────────────────

  test("DET-UNICODE-001: returns false when TERM=dumb", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "dumb" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("false");
  });

  test("DET-UNICODE-002: returns false when NO_COLOR=1", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "1", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("false");
  });

  test("DET-UNICODE-003: returns true for xterm-256color", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("true");
  });

  test("DET-UNICODE-004: returns true when no env vars set", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("true");
  });

  test("DET-UNICODE-005: returns true when NO_COLOR is empty string", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("true");
  });

  test("DET-UNICODE-006: TERM=dumb takes priority (returns false even with NO_COLOR unset)", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "dumb" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("false");
  });

  // ── TypeScript compilation ─────────────────────────────────────────────

  test("DET-TSC-001: theme/detect.ts compiles under tsc --noEmit", async () => {
    const result = await run(["bun", "run", "check"]);
    if (result.exitCode !== 0) {
      console.error("tsc stderr:", result.stderr);
      console.error("tsc stdout:", result.stdout);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);

  // ── Integration: consistent with existing detectColorTier ──────────────

  test("DET-COMPAT-001: ColorTier type is compatible with lib/diff-syntax ColorTier", async () => {
    // Both modules export the same string union type. Verify they produce
    // the same result for the truecolor case.
    const r = await run(
      [BUN, "-e", [
        "import { detectColorCapability } from './src/theme/detect.js';",
        "import { detectColorTier } from './src/lib/diff-syntax.js';",
        "const a = detectColorCapability();",
        "const b = detectColorTier();",
        "console.log(a, b);"
      ].join(" ")],
      { env: { NO_COLOR: "", COLORTERM: "truecolor", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor truecolor");
  });

  test("DET-COMPAT-002: both modules agree on ansi256 for TERM=xterm-256color", async () => {
    const r = await run(
      [BUN, "-e", [
        "import { detectColorCapability } from './src/theme/detect.js';",
        "import { detectColorTier } from './src/lib/diff-syntax.js';",
        "console.log(detectColorCapability(), detectColorTier());"
      ].join(" ")],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256 ansi256");
  });

  // ── Behavioral divergence: new module handles NO_COLOR ─────────────────

  test("DET-COMPAT-003: new module returns ansi16 for NO_COLOR while old module does not check NO_COLOR", async () => {
    // This documents the intentional behavioral divergence. The new module
    // respects NO_COLOR; the old one does not. Both are correct in their
    // respective contexts — the old one was designed before NO_COLOR was
    // a requirement. The migration ticket will unify behavior.
    const r = await run(
      [BUN, "-e", [
        "import { detectColorCapability } from './src/theme/detect.js';",
        "import { detectColorTier } from './src/lib/diff-syntax.js';",
        "console.log(detectColorCapability(), detectColorTier());"
      ].join(" ")],
      { env: { NO_COLOR: "1", COLORTERM: "truecolor", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    // New module: ansi16 (NO_COLOR respected)
    // Old module: truecolor (NO_COLOR not checked, COLORTERM wins)
    expect(r.stdout.trim()).toBe("ansi16 truecolor");
  });
});
