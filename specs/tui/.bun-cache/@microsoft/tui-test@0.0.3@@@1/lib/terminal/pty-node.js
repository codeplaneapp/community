// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import pty from "node-pty";
import process from "node:process";
export const createNodePty = (target, args, options) => {
    const handle = pty.spawn(target, args, {
        name: "xterm-256color",
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env: options.env,
    });
    // On Windows, node-pty's WindowsTerminal extends EventEmitter and its
    // outSocket error handler throws non-EIO errors when
    // `this.listeners('error').length < 2`. Adding error listeners prevents
    // the throw from crashing the worker when a child process exits quickly.
    const emitter = handle;
    if (typeof emitter.on === "function") {
        emitter.on("error", () => { });
        emitter.on("error", () => { });
    }
    return {
        get pid() {
            return handle.pid;
        },
        onData(callback) {
            handle.onData(callback);
        },
        onExit(callback) {
            handle.onExit(callback);
        },
        write(data) {
            try {
                handle.write(data);
            }
            catch {
                // pty may have closed between the exited check and the write call
            }
        },
        resize(cols, rows) {
            try {
                handle.resize(cols, rows);
            }
            catch {
                // pty may have closed between the exited check and the resize call
            }
        },
        kill() {
            try {
                process.kill(handle.pid, 9);
            }
            catch {
                // process may have already exited
            }
        },
    };
};
