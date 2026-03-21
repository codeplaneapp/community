import { Terminal } from "../terminal/term.js";
import type { Suite } from "./suite.js";
import type { SnapshotStatus } from "./matchers/toMatchSnapshot.js";
export type Location = {
    row: number;
    column: number;
};
export type TestFunction = (args: {
    terminal: Terminal;
}) => void | Promise<void>;
export type TestStatus = "expected" | "unexpected" | "pending" | "skipped" | "flaky";
export type Snapshot = {
    name: string;
    result: SnapshotStatus;
};
export type TestResult = {
    status: TestStatus;
    error?: string;
    duration: number;
    snapshots: Snapshot[];
    stdout?: string;
    stderr?: string;
};
export declare class TestCase {
    readonly title: string;
    readonly location: Location;
    readonly testFunction: TestFunction;
    readonly suite: Suite;
    readonly expectedStatus: TestStatus;
    readonly annotations: string[];
    readonly id: string;
    readonly results: TestResult[];
    constructor(title: string, location: Location, testFunction: TestFunction, suite: Suite, expectedStatus?: TestStatus, annotations?: string[]);
    outcome(): TestStatus;
    snapshots(): Snapshot[];
    filePath(): string | undefined;
    titlePath(): string[];
    sourcePath(): string | undefined;
}
