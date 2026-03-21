import { Shell } from "../terminal/shell.js";
export declare const loadShellVersions: (shell: Shell[]) => Promise<{
    shell: Shell;
    version?: string | undefined;
    target: string;
}[]>;
export declare function stripAnsiEscapes(str: string): string;
export declare function fitToWidth(line: string, width: number, prefix?: string): string;
export declare const ansi: {
    eraseCurrentLine: string;
    cursorPreviousLine: string;
    cursorNextLine: string;
};
