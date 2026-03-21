import { Suite } from "../test/suite.js";
import { TestCase } from "../test/testcase.js";
declare global {
    var suite: Suite;
    var tests: {
        [testId: string]: TestCase;
    };
}
type ExecutionOptions = {
    updateSnapshot: boolean;
    trace?: boolean;
    testFilter?: string[];
};
export declare const run: (options: ExecutionOptions) => Promise<never>;
export {};
