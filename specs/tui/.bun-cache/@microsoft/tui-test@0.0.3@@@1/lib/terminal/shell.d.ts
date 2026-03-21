export declare enum Shell {
    Bash = "bash",
    WindowsPowershell = "powershell",
    Powershell = "pwsh",
    Cmd = "cmd",
    Fish = "fish",
    Zsh = "zsh",
    Xonsh = "xonsh"
}
export declare const defaultShell: Shell;
export declare const userZdotdir: string;
export declare const zdotdir: string;
export declare const shellLaunch: (shell: Shell) => Promise<{
    shellTarget: string;
    shellArgs: string[] | undefined;
}>;
export declare const shellEnv: (shell: Shell) => {
    [x: string]: string | undefined;
    TZ?: string | undefined;
    NODE_ENV?: string | undefined;
};
export declare const setupZshDotfiles: () => Promise<void>;
export declare const getPythonPath: () => Promise<string>;
