// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import ms from "pretty-ms";
import chalk from "chalk";
import { fitToWidth, ansi } from "./utils.js";
import { BaseReporter } from "./base.js";
export class ListReporter extends BaseReporter {
    _testRows;
    constructor() {
        super();
        this._testRows = {};
    }
    async start(testCount, shells, maxWorkers) {
        await super.start(testCount, shells, maxWorkers);
    }
    startTest(test, result) {
        super.startTest(test, result);
        if (!this.isTTY) {
            return;
        }
        this._testRows[test.id] = this.currentTest;
        const fullName = test.titlePath();
        const prefix = this._linePrefix(test, "start");
        const line = chalk.dim(fullName.join(" › ")) + this._lineSuffix(test, result);
        this._appendLine(line, prefix);
    }
    endTest(test, result) {
        super.endTest(test, result);
        const fullName = test.titlePath();
        const prefix = this._linePrefix(test, "end");
        const line = this._resultColor(test.outcome())(fullName.join(" › ")) +
            this._lineSuffix(test, result);
        const row = this._testRows[test.id];
        this._updateOrAppendLine(row, line, prefix);
    }
    end(rootSuite, staleSnapshotSummary) {
        return super.end(rootSuite, staleSnapshotSummary);
    }
    _resultIcon(status) {
        const color = this._resultColor(status);
        switch (status) {
            case "flaky":
            case "expected":
                return color("✔");
            case "unexpected":
                return color("✘");
            case "skipped":
            case "pending":
                return color("-");
            default:
                return " ";
        }
    }
    _linePrefix(test, testPoint) {
        const row = this._testRows[test.id] ?? this.currentTest;
        return testPoint === "end"
            ? `  ${this._resultIcon(test.outcome())}  ${chalk.dim(row)} `
            : `  ${this._resultIcon("pending")}  ${chalk.dim(row)} `;
    }
    _lineSuffix(test, result) {
        const timeTag = result.status === "pending" ? "" : chalk.dim(` (${ms(result.duration)})`);
        const retryIdx = test.results.length - (result.status === "pending" ? 0 : 1);
        const retryTag = retryIdx > 0 ? chalk.yellow(` (retry #${retryIdx})`) : "";
        return `${retryTag}${timeTag}`;
    }
    _appendLine(line, prefix) {
        process.stdout.write(prefix + fitToWidth(line, process.stdout.columns, prefix) + "\n");
    }
    _updateLine(row, line, prefix) {
        const offset = -(row - this.currentTest - 1);
        const updateAnsi = ansi.cursorPreviousLine.repeat(offset) + ansi.eraseCurrentLine;
        const restoreAnsi = ansi.cursorNextLine.repeat(offset);
        process.stdout.write(updateAnsi +
            prefix +
            fitToWidth(line, process.stdout.columns, prefix) +
            restoreAnsi);
    }
    _updateOrAppendLine(row, line, prefix) {
        if (this.isTTY) {
            this._updateLine(row, line, prefix);
        }
        else {
            this._appendLine(line, prefix);
        }
    }
}
