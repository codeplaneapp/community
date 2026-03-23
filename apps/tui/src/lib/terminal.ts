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

export interface TUILaunchOptions {
  repo?: string;
  screen?: string;
  debug?: boolean;
  apiUrl?: string;
  token?: string;
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
