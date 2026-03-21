import { IBufferCell, Terminal as XTerminal } from "@xterm/headless";
import { Terminal } from "./term.js";
export type Cell = {
    termCell: IBufferCell | undefined;
    x: number;
    y: number;
};
export declare class Locator {
    private readonly _text;
    private readonly _term;
    private readonly _xterm;
    private readonly _full;
    private readonly _strict;
    private _cells;
    constructor(_text: string | RegExp, _term: Terminal, _xterm: XTerminal, _full?: boolean | undefined, _strict?: boolean);
    private static _getIndicesOf;
    /**
     * Gets a locator's search term. This is not supported for direct usage in
     * testing and can break in future releases.
     *
     */
    searchTerm(): string | RegExp;
    /**
     * Resolves a locator to a specific set of cells. This is not supported for
     * direct usage in testing and can break in future releases.
     *
     * @param timeout
     * @param isNot
     */
    resolve(timeout: number, isNot?: boolean): Promise<Cell[] | undefined>;
}
