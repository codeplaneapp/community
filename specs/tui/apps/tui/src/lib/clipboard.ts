/**
 * Supported clipboard provider mechanisms.
 *
 * - "pbcopy": macOS native clipboard via pbcopy child process
 * - "wl-copy": Wayland compositor clipboard via wl-copy child process
 * - "xclip": X11 clipboard via xclip child process
 * - "xsel": X11 clipboard via xsel child process (fallback for xclip)
 * - "clip.exe": Windows clipboard via clip.exe (used from WSL)
 * - "osc52": Terminal-native OSC 52 escape sequence (no child process)
 * - "none": No clipboard mechanism available
 */
export type ClipboardProvider =
  | "pbcopy"
  | "wl-copy"
  | "xclip"
  | "xsel"
  | "clip.exe"
  | "osc52"
  | "none"

export interface ClipboardResult {
  /** Whether the copy operation succeeded */
  success: boolean
  /** The provider that was used, or "none" if no provider was available */
  provider: ClipboardProvider
  /** Error message if the copy failed */
  error?: string
}

let cachedProvider: ClipboardProvider | null = null

export async function detectClipboardProvider(): Promise<ClipboardProvider> {
  if (cachedProvider !== null) {
    return cachedProvider
  }

  const provider = await resolveProvider()
  cachedProvider = provider
  return provider
}

export function _resetProviderCache(): void {
  cachedProvider = null
}

async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}

function isWSL(): boolean {
  try {
    // fs is required inline to avoid global dependencies if not needed
    const fs = require("fs")
    const version = fs.readFileSync("/proc/version", "utf-8")
    return /microsoft|wsl/i.test(version)
  } catch {
    return false
  }
}

const OSC52_SUPPORTED_TERMINALS = new Set([
  "iTerm.app",
  "iTerm2",
  "tmux",
  "alacritty",
  "kitty",
  "foot",
  "WezTerm",
  "ghostty",
])

export function isOSC52Supported(): boolean {
  const termProgram = process.env.TERM_PROGRAM
  if (termProgram && OSC52_SUPPORTED_TERMINALS.has(termProgram)) {
    return true
  }

  // tmux sets TERM_PROGRAM to the outer terminal but TMUX is always set
  if (process.env.TMUX) {
    return true
  }

  return false
}

async function resolveProvider(): Promise<ClipboardProvider> {
  const platform = process.platform

  // 1. macOS: pbcopy is always installed
  if (platform === "darwin") {
    return "pbcopy"
  }

  // 2. WSL detection: check for Microsoft in kernel version
  if (platform === "linux" && isWSL()) {
    return "clip.exe"
  }

  // 3. Linux with Wayland
  if (platform === "linux" && process.env.WAYLAND_DISPLAY) {
    if (await isCommandAvailable("wl-copy")) {
      return "wl-copy"
    }
  }

  // 4. Linux with X11
  if (platform === "linux" && process.env.DISPLAY) {
    if (await isCommandAvailable("xclip")) {
      return "xclip"
    }
    if (await isCommandAvailable("xsel")) {
      return "xsel"
    }
  }

  // 5. OSC 52 terminal-native fallback
  if (isOSC52Supported()) {
    return "osc52"
  }

  // 6. No clipboard available
  return "none"
}

const CLIPBOARD_TIMEOUT_MS = 5000

function getProviderCommand(provider: ClipboardProvider): [string, string[]] {
  switch (provider) {
    case "pbcopy":
      return ["pbcopy", []]
    case "wl-copy":
      return ["wl-copy", []]
    case "xclip":
      return ["xclip", ["-selection", "clipboard"]]
    case "xsel":
      return ["xsel", ["--clipboard", "--input"]]
    case "clip.exe":
      return ["clip.exe", []]
    default:
      throw new Error(`Unsupported child process provider: ${provider}`)
  }
}

async function copyViaChildProcess(
  provider: ClipboardProvider,
  text: string
): Promise<ClipboardResult> {
  const [command, args] = getProviderCommand(provider)

  try {
    const proc = Bun.spawn([command, ...args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })

    // Write text to stdin and close
    proc.stdin.write(text)
    proc.stdin.end()

    // Wait for process to exit with timeout
    const exitCode = await Promise.race([
      proc.exited,
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          proc.kill()
          reject(new Error(`Clipboard command timed out after ${CLIPBOARD_TIMEOUT_MS}ms`))
        }, CLIPBOARD_TIMEOUT_MS)
      ),
    ])

    if (exitCode === 0) {
      return { success: true, provider }
    }

    // Read stderr for error details
    const stderrText = await new Response(proc.stderr).text()
    return {
      success: false,
      provider,
      error: `${command} exited with code ${exitCode}: ${stderrText.trim().slice(0, 200)}`,
    }
  } catch (err) {
    return {
      success: false,
      provider,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

const OSC52_MAX_PAYLOAD_BYTES = 100_000 // ~74KB of text after base64 encoding

function copyViaOSC52(text: string): ClipboardResult {
  const encoded = Buffer.from(text, "utf-8").toString("base64")

  if (encoded.length > OSC52_MAX_PAYLOAD_BYTES) {
    return {
      success: false,
      provider: "osc52",
      error: `Text too large for OSC 52 (${encoded.length} bytes encoded, max ${OSC52_MAX_PAYLOAD_BYTES})`,
    }
  }

  try {
    // ESC ] 52 ; c ; <base64> ESC \
    const sequence = `\x1b]52;c;${encoded}\x1b\\`

    // In tmux, wrap in tmux passthrough sequence
    if (process.env.TMUX) {
      // tmux passthrough: ESC Ptmux; ESC <sequence> ESC \
      const tmuxSequence = `\x1bPtmux;\x1b${sequence}\x1b\\`
      process.stdout.write(tmuxSequence)
    } else {
      process.stdout.write(sequence)
    }

    // OSC 52 is fire-and-forget — we assume success
    return { success: true, provider: "osc52" }
  } catch (err) {
    return {
      success: false,
      provider: "osc52",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  if (typeof text !== "string" || text.length === 0) {
    return { success: false, provider: "none", error: "Empty text" }
  }

  const provider = await detectClipboardProvider()

  if (provider === "none") {
    return { success: false, provider: "none", error: "No clipboard provider available" }
  }

  if (provider === "osc52") {
    return copyViaOSC52(text)
  }

  return copyViaChildProcess(provider, text)
}