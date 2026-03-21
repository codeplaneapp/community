// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { expect as jestExpect, } from "expect";
import path from "node:path";
import { Suite, suiteFilePath } from "./suite.js";
import { TestCase } from "./testcase.js";
export { Shell } from "../terminal/shell.js";
export { Key, MouseKey } from "../terminal/ansi.js";
import { toMatchSnapshot } from "./matchers/toMatchSnapshot.js";
import { toHaveBgColor } from "./matchers/toHaveBgColor.js";
import { toHaveFgColor } from "./matchers/toHaveFgColor.js";
import { toBeVisible } from "./matchers/toBeVisible.js";
const getTestLocation = () => {
    const filename = suiteFilePath(globalThis.suite);
    const errorStack = new Error().stack;
    let location = { row: 0, column: 0 };
    if (errorStack) {
        const lineInfo = errorStack
            .match(new RegExp(`${path.basename(filename)}(.*)\\)`))
            ?.at(1)
            ?.split(":")
            ?.slice(-2);
        if (lineInfo?.length === 2 &&
            lineInfo.every((info) => /^\d+$/.test(info))) {
            const [row, column] = lineInfo.map((info) => Number(info));
            location = { row, column };
        }
    }
    return location;
};
/**
 * These tests are executed in new terminal context which provides a shell and provides a new pty to each test.
 * @param title Test title.
 * @param testFunction The test function that is run when calling the test function.
 */
export function test(title, testFunction) {
    const location = getTestLocation();
    const test = new TestCase(title, location, testFunction, globalThis.suite);
    if (globalThis.tests != null) {
        globalThis.tests[test.id] = test;
    }
    globalThis.suite.tests.push(test);
}
// eslint-disable-next-line @typescript-eslint/no-namespace
(function (test_1) {
    /**
     * Specifies options or fixtures to use in a single test file or a test.describe group. Most useful to
     * set an option, for example set `shell` to configure the shell initialized for each test.
     *
     * **Usage**
     *
     * ```js
     * import { test, expect, Shell } from '@microsoft/tui-test';
     *
     * test.use({ shell: Shell.Cmd });
     *
     * test('test on cmd', async ({ terminal }) => {
     *   // The terminal now is running the shell that has been specified
     * });
     * ```
     *
     * **Details**
     *
     * `test.use` can be called either in the global scope or inside `test.describe`. It is an error to call it within
     * `beforeEach` or `beforeAll`.
     * ```
     *
     * @param options An object with local options.
     */
    test_1.use = (options) => {
        globalThis.suite.options = { ...globalThis.suite.options, ...options };
    };
    /**
     * Declares a group of tests.
     *
     * **Usage**
     *
     * ```js
     * test.describe('two tests', () => {
     *   test('one', async ({ terminal }) => {
     *     // ...
     *   });
     *
     *   test('two', async ({ terminal }) => {
     *     // ...
     *   });
     * });
     * ```
     *
     * @param title Group title.
     * @param callback A callback that is run immediately when calling test.describe
     * Any tests added in this callback will belong to the group.
     */
    test_1.describe = (title, callback) => {
        const parentSuite = globalThis.suite;
        const currentSuite = new Suite(title, "describe", parentSuite.options, parentSuite);
        parentSuite.suites.push(currentSuite);
        globalThis.suite = currentSuite;
        callback();
        globalThis.suite = parentSuite;
    };
    /**
     * Declares a skipped test. Skipped test is never run.
     *
     * **Usage**
     *
     * ```js
     * import { test, expect } from '@microsoft/tui-test';
     *
     * test.skip('broken test', async ({ page }) => {
     *   // ...
     * });
     * ```
     *
     * @param title Test title.
     * @param testFunction The test function that is run when calling the test function.
     */
    test_1.skip = (title, testFunction) => {
        const location = getTestLocation();
        const test = new TestCase(title, location, testFunction, globalThis.suite, "skipped");
        if (globalThis.tests != null) {
            globalThis.tests[test.id] = test;
        }
        globalThis.suite.tests.push(test);
    };
    /**
     * Declares a failed test.
     *
     * **Usage**
     *
     * ```js
     * import { test, expect } from '@microsoft/tui-test';
     *
     * test.fail('purposely failing test', async ({ page }) => {
     *   // ...
     * });
     * ```
     *
     * @param title Test title.
     * @param testFunction The test function that is run when calling the test function.
     */
    test_1.fail = (title, testFunction) => {
        const location = getTestLocation();
        const test = new TestCase(title, location, testFunction, globalThis.suite, "unexpected");
        if (globalThis.tests != null) {
            globalThis.tests[test.id] = test;
        }
        globalThis.suite.tests.push(test);
    };
    /**
     * Declares a conditional test.
     *
     * **Usage**
     *
     * ```js
     * import { test, expect } from '@microsoft/tui-test';
     * import os from "node:os";
     *
     * const isWindows = os.platform() == "win32"
     * test.when(isWindows, 'windows only test', async ({ page }) => {
     *   // ...
     * });
     * ```
     *
     * @param shouldRun If the test should be run or skipped.
     * @param title Test title.
     * @param testFunction The test function that is run when calling the test function.
     */
    test_1.when = (shouldRun, title, testFunction) => {
        if (shouldRun) {
            test(title, testFunction);
        }
        else {
            test_1.skip(title, testFunction);
        }
    };
    /**
     * Declares a focused test. If there are some focused tests or suites, all of them will be run but nothing else.
     *
     * **Usage**
     *
     * ```js
     * import { test, expect } from '@microsoft/tui-test';
     *
     * test.only('focus this test', async ({ page }) => {
     *   // Run only focused tests
     * });
     * ```
     *
     * @param title Test title.
     * @param testFunction The test function that is run when calling the test function.
     */
    test_1.only = (title, testFunction) => {
        const location = getTestLocation();
        const test = new TestCase(title, location, testFunction, globalThis.suite, "expected", ["only"]);
        if (globalThis.tests != null) {
            globalThis.tests[test.id] = test;
        }
        globalThis.suite.tests.push(test);
    };
})(test || (test = {}));
jestExpect.extend({
    toBeVisible,
    toMatchSnapshot,
    toHaveBgColor,
    toHaveFgColor,
});
const expect = jestExpect;
export { expect };
/**
 * Defines tui-test config
 */
export function defineConfig(config) {
    return config;
}
