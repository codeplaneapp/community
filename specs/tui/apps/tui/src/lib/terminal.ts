/**
 * Check that stdin and stdout are TTYs.
 * If not, write a clear error to stderr and exit.
 *
 * Called at the very top of index.tsx, before any imports that
 * trigger OpenTUI native library loading.
 */
export function assertTTY(): void {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "stdin is not a TTY. The TUI requires an interactive terminal.\n"
    );
    process.exit(1);
  }
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "stdout is not a TTY. The TUI requires an interactive terminal.\n"
    );
    process.exit(1);
  }
}

/**
 * Parse CLI arguments relevant to the bootstrap.
 * Returns structured options. Unknown flags are ignored.
 */
export interface TUILaunchOptions {
  repo?: string;          // --repo owner/repo
  screen?: string;        // --screen dashboard|issues|...
  debug?: boolean;        // --debug or CODEPLANE_TUI_DEBUG=true
  apiUrl?: string;        // resolved from CODEPLANE_API_URL
  token?: string;         // resolved from CODEPLANE_TOKEN
}

export function parseCLIArgs(argv: string[]): TUILaunchOptions {
  const opts: TUILaunchOptions = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--repo":
        opts.repo = argv[++i];
        break;
      case "--screen":
        opts.screen = argv[++i];
        break;
      case "--debug":
        opts.debug = true;
        break;
    }
  }
  opts.debug = opts.debug || process.env.CODEPLANE_TUI_DEBUG === "true";
  opts.apiUrl = process.env.CODEPLANE_API_URL ?? "http://localhost:3000";
  opts.token = process.env.CODEPLANE_TOKEN;
  return opts;
}