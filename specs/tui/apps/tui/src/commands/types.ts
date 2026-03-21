export interface PaletteCommand {
  id: string;
  name: string;
  aliases?: string[];
  description: string;
  category: "Navigate" | "Action" | "Toggle";
  /** Shown next to the command name in the palette when set. */
  keybinding?: string;
  /**
   * Lower number = higher priority in results.
   * Range: 0 (highest) – 100 (lowest).
   */
  priority: number;
  contextRequirements?: {
    repo?: boolean;
    authenticated?: boolean;
    writeAccess?: boolean;
  };
  featureFlag?: string;
  action: () => void;
}

export interface CommandContext {
  navigate: (screen: string, params?: Record<string, string>) => void;
  hasRepoContext: () => boolean;
  getRepoContext: () => { owner: string; repo: string } | null;
  hasWriteAccess: () => boolean;
}
