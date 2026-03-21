import { TestCase, TestResult, TestStatus } from "../test/testcase.js";
import { Shell } from "../terminal/shell.js";
import { Suite } from "../test/suite.js";
export type StaleSnapshotSummary = {
    obsolete: number;
    removed: number;
};
export declare class BaseReporter {
    protected currentTest: number;
    protected isTTY: boolean;
    constructor();
    private _plural;
    start(testCount: number, shells: Shell[], maxWorkers: number): Promise<void>;
    startTest(test: TestCase, result: TestResult): void;
    endTest(test: TestCase, result: TestResult): void;
    end(rootSuite: Suite, staleSnapshotSummary: StaleSnapshotSummary): number;
    private _generateSummary;
    private _printSummary;
    private _header;
    private _retryHeader;
    private _stdStreamHeader;
    private _printFailures;
    protected _resultColor(status: TestStatus): (str: string) => string;
}
