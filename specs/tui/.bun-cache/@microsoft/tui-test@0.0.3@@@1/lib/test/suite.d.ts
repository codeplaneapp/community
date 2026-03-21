import { TestOptions } from "./option.js";
import { TestConfig } from "../config/config.js";
import type { TestCase } from "./testcase.js";
type SuiteType = "file" | "describe" | "project" | "root";
export declare class Suite {
    readonly title: string;
    readonly type: SuiteType;
    options?: TestOptions | undefined;
    parentSuite?: Suite | undefined;
    suites: Suite[];
    tests: TestCase[];
    source?: string;
    constructor(title: string, type: SuiteType, options?: TestOptions | undefined, parentSuite?: Suite | undefined);
    allTests(): TestCase[];
    titlePath(): string[];
}
export declare const suiteFilePath: (suite: Suite) => string | undefined;
export declare const getRootSuite: (config: Required<TestConfig>) => Promise<Suite>;
export {};
