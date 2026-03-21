import { Shell } from "../terminal/shell.js";
import { TestCase, TestResult } from "../test/testcase.js";
import { BaseReporter, StaleSnapshotSummary } from "./base.js";
import { Suite } from "../test/suite.js";
export declare class ListReporter extends BaseReporter {
    private _testRows;
    constructor();
    start(testCount: number, shells: Shell[], maxWorkers: number): Promise<void>;
    startTest(test: TestCase, result: TestResult): void;
    endTest(test: TestCase, result: TestResult): void;
    end(rootSuite: Suite, staleSnapshotSummary: StaleSnapshotSummary): number;
    private _resultIcon;
    private _linePrefix;
    private _lineSuffix;
    private _appendLine;
    private _updateLine;
    private _updateOrAppendLine;
}
