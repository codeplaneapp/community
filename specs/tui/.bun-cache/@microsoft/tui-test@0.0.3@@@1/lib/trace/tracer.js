// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";
import process from "node:process";
import fsAsync from "node:fs/promises";
import { promisify } from "node:util";
import { enableWin32InputMode } from "../terminal/ansi.js";
const zipInflate = promisify(zlib.inflate);
const zipDeflate = promisify(zlib.deflate);
const traceFilename = (testId, attempt) => {
    const test = globalThis.tests[testId];
    const filename = path
        .relative(process.cwd(), path.resolve(test.filePath()))
        .replace(path.sep, "-");
    const title = test.titlePath().slice(1).join("-");
    const retry = attempt > 0 ? `-retry${attempt}` : "";
    const name = `${filename}-${title}${retry}`.replaceAll(/[ /\\<>:"'|?*]/g, "-");
    return name;
};
const testName = (testId) => {
    const test = globalThis.tests[testId];
    const t = test.titlePath();
    const [filename, row, column] = t[0].split(":");
    const testPath = [
        ...path.relative(process.cwd(), path.resolve(filename)).split(path.sep),
        row,
        column,
    ];
    const testName = t.slice(1);
    return { testName, testPath };
};
export const loadTrace = async (traceFilename) => {
    if (!fs.existsSync(traceFilename)) {
        throw new Error("unable to load trace, file not found");
    }
    return JSON.parse((await zipInflate(await fsAsync.readFile(traceFilename))).toString());
};
export const saveTrace = async (tracePoints, testId, attempt, traceFolder) => {
    const filename = traceFilename(testId, attempt);
    if (!fs.existsSync(traceFolder)) {
        await fsAsync.mkdir(traceFolder, { recursive: true });
    }
    // remove win32-input-mode enable sequence if it comes through data
    const cleanedTracePoints = tracePoints.map((tracePoint) => {
        if ("data" in tracePoint) {
            return {
                ...tracePoint,
                data: tracePoint.data.replaceAll(enableWin32InputMode, ""),
            };
        }
        return tracePoint;
    });
    const trace = {
        tracePoints: cleanedTracePoints,
        attempt,
        ...testName(testId),
    };
    await fsAsync.writeFile(path.join(traceFolder, filename), await zipDeflate(Buffer.from(JSON.stringify(trace), "utf8")));
};
