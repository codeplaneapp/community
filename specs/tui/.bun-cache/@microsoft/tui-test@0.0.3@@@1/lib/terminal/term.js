// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import xterm from "@xterm/headless";
import process from "node:process";
import ansi, { MouseKey } from "./ansi.js";
import { createPty } from "./pty.js";
import { Shell, shellLaunch, shellEnv } from "./shell.js";
import which from "which";
import { Locator } from "./locator.js";
export const spawn = async (options, trace, traceEmitter) => {
    if (options.program != null) {
        const { file, args } = options.program;
        const resolvedFile = await which(file, { nothrow: true });
        if (resolvedFile == null) {
            throw new Error(`unable to spawn terminal, unable to resolve file '${file}' from PATH`);
        }
        const ptyBackend = await createPty(resolvedFile, args ?? [], {
            cols: options.cols,
            rows: options.rows,
            cwd: process.cwd(),
            env: options.env,
        });
        return new Terminal(ptyBackend, options.rows, options.cols, trace, options.shell, traceEmitter);
    }
    const { shellTarget, shellArgs } = await shellLaunch(options.shell);
    const env = { ...shellEnv(options.shell), ...options.env };
    const ptyBackend = await createPty(shellTarget, options.shellArgs ?? shellArgs ?? [], {
        cols: options.cols,
        rows: options.rows,
        cwd: process.cwd(),
        env,
    });
    return new Terminal(ptyBackend, options.rows, options.cols, trace, options.shell, traceEmitter);
};
export class Terminal {
    _rows;
    _cols;
    _trace;
    _shell;
    _traceEmitter;
    _pty;
    _term;
    _returnChar;
    _exitResult = null;
    get _exited() {
        return this._exitResult !== null;
    }
    get exitResult() {
        return this._exitResult;
    }
    onExit;
    constructor(ptyBackend, _rows, _cols, _trace, _shell, _traceEmitter) {
        this._rows = _rows;
        this._cols = _cols;
        this._trace = _trace;
        this._shell = _shell;
        this._traceEmitter = _traceEmitter;
        this._returnChar = this._shell == Shell.Xonsh ? "\n" : "\r";
        this._pty = ptyBackend;
        this._term = new xterm.Terminal({
            allowProposedApi: true,
            rows: this._rows,
            cols: this._cols,
        });
        if (this._trace) {
            this._traceEmitter.emit("size", this._rows, this._cols);
        }
        this._pty.onData((data) => {
            if (this._trace) {
                this._traceEmitter.emit("data", data, Date.now());
            }
            this._term.write(data);
        });
        this._pty.onExit((exitResult) => {
            this._exitResult = exitResult;
        });
        this.onExit = (callback) => {
            if (this._exitResult) {
                callback(this._exitResult);
            }
            else {
                this._pty.onExit(callback);
            }
        };
    }
    /**
     * Change the size of the terminal
     *
     * @param columns Count of column cells
     * @param rows Count of row cells
     */
    resize(columns, rows) {
        this._cols = columns;
        this._rows = rows;
        if (!this._exited) {
            this._pty.resize(columns, rows);
        }
        this._term.resize(columns, rows);
        if (this._trace) {
            this._traceEmitter.emit("size", rows, columns);
        }
    }
    /**
     * Write the provided data through to the shell
     *
     * @param data Data to write to the shell
     */
    write(data) {
        if (!this._exited) {
            this._pty.write(data);
        }
    }
    /**
     * Write the provided data through to the shell and submit with a return character.
     * If running a program with no shell selected, the return character will use the return
     * character for the default shell.
     *
     * @param data Data to write to the shell
     */
    submit(data) {
        if (!this._exited) {
            this._pty.write(`${data ?? ""}${this._returnChar}`);
        }
    }
    /**
     * Press up arrow key a specific amount of times.
     *
     * @param count Count of cells to move up. Default is `1`.
     */
    keyUp(count) {
        this._pty.write(ansi.keyUp.repeat(count ?? 1));
    }
    /**
     * Press down arrow key a specific amount of times.
     *
     * @param count Count of cells to move down. Default is `1`.
     */
    keyDown(count) {
        this._pty.write(ansi.keyDown.repeat(count ?? 1));
    }
    /**
     * Press left arrow key a specific amount of times.
     *
     * @param count Count of cells to move left. Default is `1`.
     */
    keyLeft(count) {
        this._pty.write(ansi.keyLeft.repeat(count ?? 1));
    }
    /**
     * Press right arrow key a specific amount of times.
     *
     * @param count Count of cells to move right. Default is `1`.
     */
    keyRight(count) {
        this._pty.write(ansi.keyRight.repeat(count ?? 1));
    }
    /**
     * Press escape key a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyEscape(count) {
        this._pty.write(ansi.ESC.repeat(count ?? 1));
    }
    /**
     * Press delete key a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyDelete(count) {
        this._pty.write(ansi.keyDelete.repeat(count ?? 1));
    }
    /**
     * Press backspace key a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyBackspace(count) {
        this._pty.write(ansi.keyBackspace.repeat(count ?? 1));
    }
    /**
     * Press Ctrl+C key combination a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyCtrlC(count) {
        this._pty.write(ansi.keyCtrlC.repeat(count ?? 1));
    }
    /**
     * Press Ctrl+D key combination a specific amount of times.
     *
     * @param count Count of key presses. Default is `1`.
     */
    keyCtrlD(count) {
        this._pty.write(ansi.keyCtrlD.repeat(count ?? 1));
    }
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
    keyPress(key, options) {
        if (!this._exited) {
            this._pty.write(ansi.keyCombo(key, options));
        }
    }
    /**
     * Send a mouse down event at the given position.
     *
     * @param x The column (0-based)
     * @param y The row (0-based)
     * @param options.button The mouse button. Default is `MouseKey.Left`.
     */
    mouseDown(x, y, options) {
        if (!this._exited) {
            this._pty.write(ansi.mouseDown(x, y, options?.button ?? MouseKey.Left));
        }
    }
    /**
     * Send a mouse up event at the given position.
     *
     * @param x The column (0-based)
     * @param y The row (0-based)
     * @param options.button The mouse button. Default is `MouseKey.Left`.
     */
    mouseUp(x, y, options) {
        if (!this._exited) {
            this._pty.write(ansi.mouseUp(x, y, options?.button ?? MouseKey.Left));
        }
    }
    /**
     * Send a mouse press (down + up) at the given position.
     *
     * @param x The column (0-based)
     * @param y The row (0-based)
     * @param options.button The mouse button. Default is `MouseKey.Left`.
     */
    mousePress(x, y, options) {
        this.mouseDown(x, y, options);
        this.mouseUp(x, y, options);
    }
    /**
     * Send a mouse move event to the given position.
     *
     * @param x The column (0-based)
     * @param y The row (0-based)
     */
    mouseTo(x, y) {
        if (!this._exited) {
            this._pty.write(ansi.mouseMove(x, y));
        }
    }
    /**
     * Get an array representation of the entire active terminal buffer
     *
     * @returns an array representation of the buffer
     */
    getBuffer() {
        return this._getBuffer(0, this._term.buffer.active.length);
    }
    /**
     * Get an array representation of the visible active terminal buffer
     *
     * @returns an array representation of the buffer
     */
    getViewableBuffer() {
        return this._getBuffer(this._term.buffer.active.baseY, this._term.buffer.active.length);
    }
    _getBuffer(startY, endY) {
        const lines = [];
        for (let y = startY; y < endY; y++) {
            const termLine = this._term.buffer.active.getLine(y);
            const line = [];
            let cell = termLine?.getCell(0);
            for (let x = 0; x < this._term.cols; x++) {
                cell = termLine?.getCell(x, cell);
                const rawChars = cell?.getChars() ?? "";
                const chars = rawChars === "" ? " " : rawChars;
                line.push(chars);
            }
            lines.push(line);
        }
        return lines;
    }
    /**
     * Get the terminal's cursor positions
     *
     * @returns the cursor's positions
     */
    getCursor() {
        return {
            x: this._term.buffer.active.cursorX,
            y: this._term.buffer.active.cursorY,
            baseY: this._term.buffer.active.baseY,
        };
    }
    _shift(baseCell, targetCell) {
        const result = {};
        if (!(baseCell?.getBgColorMode() == targetCell?.getBgColorMode() &&
            baseCell?.getBgColor() == targetCell?.getBgColor())) {
            result.bgColorMode = targetCell?.getBgColorMode();
            result.bgColor = targetCell?.getBgColor();
        }
        if (!(baseCell?.getFgColorMode() == targetCell?.getFgColorMode() &&
            baseCell?.getFgColor() == targetCell?.getFgColor())) {
            result.fgColorMode = targetCell?.getFgColorMode();
            result.fgColor = targetCell?.getFgColor();
        }
        if (baseCell?.isBlink() !== targetCell?.isBlink()) {
            result.blink = targetCell?.isBlink();
        }
        if (baseCell?.isBold() !== targetCell?.isBold()) {
            result.bold = targetCell?.isBold();
        }
        if (baseCell?.isDim() !== targetCell?.isDim()) {
            result.dim = targetCell?.isDim();
        }
        if (baseCell?.isInverse() !== targetCell?.isInverse()) {
            result.inverse = targetCell?.isInverse();
        }
        if (baseCell?.isInvisible() !== targetCell?.isInvisible()) {
            result.invisible = targetCell?.isInvisible();
        }
        if (baseCell?.isItalic() !== targetCell?.isItalic()) {
            result.italic = targetCell?.isItalic();
        }
        if (baseCell?.isOverline() !== targetCell?.isOverline()) {
            result.overline = targetCell?.isOverline();
        }
        if (baseCell?.isStrikethrough() !== targetCell?.isStrikethrough()) {
            result.strike = targetCell?.isStrikethrough();
        }
        if (baseCell?.isUnderline() !== targetCell?.isUnderline()) {
            result.underline = targetCell?.isUnderline();
        }
        return result;
    }
    /**
     * Creates a locator for the terminal to search for cells matching the
     * given pattern
     *
     * @param text
     * @param options
     */
    getByText(text, options) {
        return new Locator(text, this, this._term, options?.full, options?.strict ?? true);
    }
    /**
     * Serialize the terminal into an encoding for snapshots
     *
     * @returns snapshot information
     */
    serialize() {
        const shifts = new Map();
        const lines = [];
        const empty = (o) => Object.keys(o).length === 0;
        let prevCell = undefined;
        for (let y = this._term.buffer.active.baseY; y < this._term.buffer.active.length; y++) {
            const line = this._term.buffer.active.getLine(y);
            const lineView = [];
            if (line == null)
                continue;
            for (let x = 0; x < line.length; x++) {
                const cell = line.getCell(x);
                const chars = cell?.getChars() ?? "";
                lineView.push(chars.length === 0 ? " " : chars);
                const shift = this._shift(prevCell, cell);
                if (!empty(shift)) {
                    shifts.set(`${x},${y}`, shift);
                }
                prevCell = cell;
            }
            lines.push(lineView.join(""));
        }
        const view = this._box(lines.join("\n"), this._term.cols);
        return { view, shifts };
    }
    _box(view, width) {
        const top = "╭" + "─".repeat(width) + "╮";
        const bottom = "╰" + "─".repeat(width) + "╯";
        return [
            top,
            ...view.split("\n").map((line) => "│" + line + "│"),
            bottom,
        ].join("\n");
    }
    /**
     * Kill the terminal and underlying processes
     */
    kill() {
        this._pty.kill();
    }
}
