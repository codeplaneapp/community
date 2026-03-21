export type PtyOptions = {
    cols: number;
    rows: number;
    cwd: string;
    env?: {
        [key: string]: string | undefined;
    };
};
export interface IPtyBackend {
    readonly pid: number;
    onData(callback: (data: string) => void): void;
    onExit(callback: (exit: {
        exitCode: number;
        signal?: number;
    }) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
}
export declare const createPty: (target: string, args: string[], options: PtyOptions) => Promise<IPtyBackend>;
