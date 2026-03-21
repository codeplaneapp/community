// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { defaultShell } from "../terminal/shell.js";
import { cacheFolderName, configFileName } from "../utils/constants.js";
const configPath = path.join(process.cwd(), cacheFolderName, configFileName);
let loadedConfig;
export const loadConfig = async () => {
    const userConfig = !fs.existsSync(configPath)
        ? {}
        : (await import(`file://${configPath}`)).default ?? {};
    loadedConfig = {
        testMatch: userConfig.testMatch ?? "**/*.@(spec|test).?(c|m)[jt]s?(x)",
        expect: {
            timeout: userConfig.expect?.timeout ?? 5000,
        },
        globalTimeout: userConfig.globalTimeout ?? 0,
        retries: userConfig.retries ?? 0,
        projects: userConfig.projects ?? [],
        timeout: userConfig.timeout ?? 30000,
        reporter: userConfig.reporter ?? "list",
        workers: Math.max(userConfig.workers ?? Math.max(Math.floor(os.cpus().length / 2), 1), 1),
        trace: userConfig.trace ?? false,
        traceFolder: userConfig.traceFolder ?? path.join(process.cwd(), "tui-traces"),
        shellReadyTimeout: userConfig.shellReadyTimeout ?? 30000,
        use: {
            shell: userConfig.use?.shell ?? defaultShell,
            rows: userConfig.use?.rows ?? 30,
            columns: userConfig.use?.columns ?? 80,
            program: userConfig.use?.program,
        },
    };
    return loadedConfig;
};
export const getExpectTimeout = () => loadedConfig?.expect.timeout ?? 5000;
export const getTimeout = () => loadedConfig?.timeout ?? 30000;
export const getRetries = () => loadedConfig?.retries ?? 0;
export const getShellReadyTimeout = () => loadedConfig?.shellReadyTimeout ?? 30000;
