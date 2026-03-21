/// <reference types="node" resolution-mode="require"/>
import { EventEmitter } from "node:events";
import { Key, MouseKey } from "./ansi.js";
import { type IPtyBackend } from "./pty.js";
import { Shell } from "./shell.js";
import { Locator } from "./locator.js";
type TerminalOptions = {
    env?: {
        [key: string]: string | undefined;
    };
    rows: number;
    cols: number;
    shell: Shell;
    shellArgs?: string[];
    program?: {
        file: string;
        args?: string[];
    };
};
type CursorPosition = {
    /**
     * The x position of the cursor. This ranges between 0 (left side) and Terminal.cols (after last cell of the row).
     */
    x: number;
    /**
     * The y position of the cursor. This ranges between 0 (when the cursor is at baseY) and Terminal.rows - 1 (when the cursor is on the last row).
     */
    y: number;
    /**
     * The line within the buffer where the top of the bottom page is (when fully scrolled down).
     */
    baseY: number;
};
export declare const spawn: (options: TerminalOptions, trace: boolean, traceEmitter: EventEmitter) => Promise<Terminal>;
type CellShift = {
    bgColorMode?: number;
    bgColor?: number;
    fgColorMode?: number;
    fgColor?: number;
    blink?: number;
    bold?: number;
    dim?: number;
    inverse?: number;
    invisible?: number;
    italic?: number;
    overline?: number;
    strike?: number;
    underline?: number;
};
export declare class Terminal {
    private _rows;
    private _cols;
    private _trace;
    private _shell;
    private _traceEmitter;
    private readonly _pty;
    private readonly _term;
    private readonly _returnChar;
    private _exitResult;
    private get _exited();
    get exitResult(): {
        exitCode: number;
        signal?: number | undefined;
    } | null;
    readonly onExit: (callback: (exit: {
        exitCode: number;
        signal?: number;
    }) => void) => void;
    constructor(ptyBackend: IPtyBackend, _rows: number, _cols: number, _trace: boolean, _shell: Shell, _traceEmitter: EventEmitter);
    /**
     * Change the size of the terminal
     *
     * @param columns Count of column cells
     * @param rows Count of row cells
     */
    resize(columns: number, rows: number): void;
    /**
     * Write the provided data through to the shell
     *
     * @param data Data to write to the shell
     */
    write(data: string): void;
    /**
     * Write the provided data through to the shell and submit with a return character.
     * If running a program with no shell selected, the return character will use the return
     * character for the default shell.
     *
     * @param data Data to write to the shell
     */
    submit(data?: string): void;
    /**
     * Press up arrow key a specific amount of times.
     *
     * @param count Count of cells to move up. Default is `1`.
     */
    keyUp(count?: number | undefined): void;
    /**
     * Press down arrow key a specific amount of times.
     *
     * @param count Count of cells to move down. Default is `1`.
     */
    keyDown(count?: number | undefined): void;
    /**
     * Press left arrow key a specific amount of times.
     *
     * @param count Count of cells to move left. Default is `1`.
     */
    keyLeft(count?: number | undefined): void;
    /**
     * Press right arrow key a specific amount of times.
     *
     * @param count Count of cells to move right. Default is `1`.
     */
    keyRight(count?: number | undefined): void;
    /**
     * Press escape key a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyEscape(count?: number | undefined): void;
    /**
     * Press delete key a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyDelete(count?: number | undefined): void;
    /**
     * Press backspace key a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyBackspace(count?: number | undefined): void;
    /**
     * Press Ctrl+C key combination a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyCtrlC(count?: number | undefined): void;
    /**
     * Press Ctrl+D key combination a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyCtrlD(count?: number | undefined): void;
    /**
     * Press an arbitrary key, optionally with modifier keys (Ctrl, Alt, Shift).
     *
     * For single printable characters, pass the character as a string.
     * For special keys (arrows, function keys, etc.), use the `Key` enum.
     *
     * @param key A single character string or a `Key` enum value.
     * @param options.ctrl Whether Ctrl is held. Default is `false`.
     * @param options.alt Whether Alt is held. Default is `false`.
     * @param options.shift Whether Shift is held. Default is `false`.
     */
    keyPress(key: string | Key, options?: {
        ctrl?: boolean;
        alt?: boolean;
        shift?: boolean;
    }): void;
    /**
     * Send a mouse down event at the given position.
     *
     * @param x The column (0-based)
     * @param y The row (0-based)
     * @param options.button The mouse button. Default is `MouseKey.Left`.
     */
    mouseDown(x: number, y: number, options?: {
        button?: MouseKey;
    }): void;
    /**
     * Send a mouse up event at the given position.
     *
     * @param x The column (0-based)
     * @param y The row (0-based)
     * @param options.button The mouse button. Default is `MouseKey.Left`.
     */
    mouseUp(x: number, y: number, options?: {
        button?: MouseKey;
    }): void;
    /**
     * Send a mouse press (down + up) at the given position.
     *
     * @param x The column (0-based)
     * @param y The row (0-based)
     * @param options.button The mouse button. Default is `MouseKey.Left`.
     */
    mousePress(x: number, y: number, options?: {
        button?: MouseKey;
    }): void;
    /**
     * Send a mouse move event to the given position.
     *
     * @param x The column (0-based)
     * @param y The row (0-based)
     */
    mouseTo(x: number, y: number): void;
    /**
     * Get an array representation of the entire active terminal buffer
     *
     * @returns an array representation of the buffer
     */
    getBuffer(): string[][];
    /**
     * Get an array representation of the visible active terminal buffer
     *
     * @returns an array representation of the buffer
     */
    getViewableBuffer(): string[][];
    private _getBuffer;
    /**
     * Get the terminal's cursor positions
     *
     * @returns the cursor's positions
     */
    getCursor(): CursorPosition;
    private _shift;
    /**
     * Creates a locator for the terminal to search for cells matching the
     * given pattern
     *
     * @param text
     * @param options
     */
    getByText(text: string | RegExp, options?: {
        /**
         * Whether to check the entire terminal buffer for the value instead of only the visible section.
         */
        full?: boolean;
        /**
         * Whether to throw errors when the locator can match multiple sets of cells
         *
         * @default true
         */
        strict?: boolean;
    }): Locator;
    /**
     * Serialize the terminal into an encoding for snapshots
     *
     * @returns snapshot information
     */
    serialize(): {
        view: string;
        shifts: Map<string, CellShift>;
    };
    private _box;
    /**
     * Kill the terminal and underlying processes
     */
    kill(): void;
}
export {};
