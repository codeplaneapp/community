// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import ms from "pretty-ms";
import { poll } from "../utils/poll.js";
import { strictModeErrorPrefix } from "../utils/constants.js";
export class Locator {
    _text;
    _term;
    _xterm;
    _full;
    _strict;
    _cells;
    constructor(_text, _term, _xterm, _full = undefined, _strict = false) {
        this._text = _text;
        this._term = _term;
        this._xterm = _xterm;
        this._full = _full;
        this._strict = _strict;
    }
    static _getIndicesOf(substring, string) {
        const indices = [];
        let index = 0;
        while ((index = string.indexOf(substring, index)) > -1) {
            indices.push(index);
            index += substring.length;
        }
        return indices;
    }
    /**
     * Gets a locator's search term. This is not supported for direct usage in
     * testing and can break in future releases.
     *
     */
    searchTerm() {
        return this._text;
    }
    /**
     * Resolves a locator to a specific set of cells. This is not supported for
     * direct usage in testing and can break in future releases.
     *
     * @param timeout
     * @param isNot
     */
    async resolve(timeout, isNot = false) {
        if (this._cells != null)
            return this._cells;
        const result = await poll(() => {
            const buffer = this._full
                ? this._term.getBuffer()
                : this._term.getViewableBuffer();
            const block = buffer.map((bufferLine) => bufferLine.join("")).join("");
            let index = 0;
            let length = 0;
            if (typeof this._text === "string") {
                const indices = Locator._getIndicesOf(this._text, block);
                if (indices.length > 1 && this._strict) {
                    throw new Error(`${strictModeErrorPrefix}: getByText(${this._text.toString()}) resolved to ${indices.length} elements`);
                }
                if (indices.length == 0) {
                    return false;
                }
                index = indices[0];
                length = this._text.length;
            }
            else {
                const matches = Array.from(block.matchAll(this._text));
                if (matches.length > 1 && this._strict) {
                    throw new Error(`${strictModeErrorPrefix}: getByText(${this._text.toString()}) resolved to ${matches.length} elements`);
                }
                if (matches.length == 0) {
                    return false;
                }
                index = matches[0].index;
                length = matches[0].length;
            }
            const baseY = this._full ? 0 : this._xterm.buffer.active.baseY;
            this._cells = [];
            for (let y = 0; y < buffer.length; y++) {
                for (let x = 0; x < buffer[y].length ?? 0; x++) {
                    const pos = x + y * buffer[y].length;
                    if (pos >= index && pos < index + length) {
                        this._cells.push({
                            termCell: this._xterm.buffer.active
                                .getLine(baseY + y)
                                ?.getCell(x),
                            x,
                            y,
                        });
                    }
                }
            }
            return true;
        }, 50, timeout, isNot);
        if (!result && !isNot) {
            const buffer = this._full
                ? this._term.getBuffer()
                : this._term.getViewableBuffer();
            const snapshot = buffer
                .map((bufferLine) => bufferLine.join("").trimEnd())
                .join("\n");
            throw new Error(`locator timeout: getByText(${this._text.toString()}) resolved to 0 elements after ${ms(timeout)}\n\nTerminal content:\n---START---\n${snapshot}\n---END---`);
        }
        if (!result && isNot) {
            this._cells = undefined;
        }
        return this._cells;
    }
}
