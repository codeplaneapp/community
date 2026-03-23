import { describe, test, expect } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { TUI_ROOT, TUI_SRC, run, bunEval } from "./helpers.ts"

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
