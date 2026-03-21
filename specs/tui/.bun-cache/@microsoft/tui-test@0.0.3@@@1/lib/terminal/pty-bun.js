// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { EventEmitter } from "node:events";
export const createBunPty = (target, args, options) => {
    const emitter = new EventEmitter();
    const terminal = new Bun.Terminal({
        cols: options.cols,
        rows: options.rows,
        data(_term, data) {
            emitter.emit("data", new TextDecoder().decode(data));
        },
    });
    const proc = Bun.spawn([target, ...args], {
        cwd: options.cwd,
        env: options.env,
        terminal: terminal,
    });
    proc.exited.then((exitCode) => {
        emitter.emit("exit", { exitCode, signal: proc.signalCode ?? undefined });
    });
    return {
        get pid() {
            return proc.pid;
        },
        onData(callback) {
            emitter.on("data", callback);
        },
        onExit(callback) {
            emitter.on("exit", callback);
        },
        write(data) {
            terminal.write(data);
        },
        resize(cols, rows) {
            terminal.resize(cols, rows);
        },
        kill() {
            proc.kill(9);
        },
    };
};
