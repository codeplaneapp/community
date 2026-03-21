import { TestOptions } from "../test/option.js";
export declare const loadConfig: () => Promise<Required<TestConfig>>;
export declare const getExpectTimeout: () => number;
export declare const getTimeout: () => number;
export declare const getRetries: () => number;
export declare const getShellReadyTimeout: () => number;
declare type TestProject = {
    /**
     * Project name is visible in the report and during test execution.
     */
    name?: string;
};
declare type WorkerOptions = {
    /**
     * Only the files matching one of these patterns are executed as test files. Matching is performed against the
     * absolute file path. Strings are treated as glob patterns.
     *
     * By default, TUI Test looks for files matching the following glob pattern: `**\/*.@(spec|test).?(c|m)[jt]s?(x)`.
     * This means JavaScript or TypeScript files with `".test"` or `".spec"` suffix, for example
     * `bash.integration.spec.ts`.
     *
     * Use testConfig.testMatch to change this option for all projects.
     */
    testMatch?: string;
};
export declare type ProjectConfig = TestOptions & Required<WorkerOptions> & TestProject;
export declare type TestConfig = {
    /**
     * Configuration for the `expect` assertion library.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   expect: {
     *     timeout: 10000,
     *   },
     * });
     * ```
     *
     */
    expect?: {
        /**
         * Default timeout for async expect matchers in milliseconds, defaults to 5000ms.
         */
        timeout?: number;
    };
    /**
     * Timeout for each test in milliseconds. Defaults to 30 seconds.
     *
     * This is a base timeout for all tests.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   timeout: 5 * 60 * 1000,
     * });
     * ```
     *
     */
    timeout?: number;
    /**
     * Only the files matching one of these patterns are executed as test files. Matching is performed against the
     * absolute file path. Strings are treated as glob patterns.
     *
     * By default, TUI Test looks for files matching the following glob pattern: `**\/*.@(spec|test).?(c|m)[jt]s?(x)`.
     * This means JavaScript or TypeScript files with `".test"` or `".spec"` suffix, for example
     * `bash.integration.spec.ts`.
     *
     * Use testConfig.testMatch to change this option for all projects.
     */
    testMatch?: string;
    /**
     * Maximum time in milliseconds the whole test suite can run. Zero timeout (default) disables this behavior. Useful on
     * CI to prevent broken setup from running too long and wasting resources.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   globalTimeout: process.env.CI ? 60 * 60 * 1000 : undefined,
     * });
     * ```
     *
     */
    globalTimeout?: number;
    /**
     * The maximum number of retry attempts given to failed tests. By default failing tests are not retried.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   retries: 2,
     * });
     * ```
     *
     */
    retries?: number;
    /**
     * The list of builtin reporters to use.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   reporter: 'list',
     * });
     * ```
     *
     */
    reporter?: "list";
    /**
     * Options for all tests in this project
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig, Shell } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   projects: [
     *     {
     *       name: 'bash',
     *       use: {
     *         shell: Shell.Bash,
     *       },
     *     },
     *   ],
     * });
     * ```
     *
     * Use testConfig.use to change this option for
     * all projects.
     */
    use?: TestOptions;
    /**
     * The number of workers to use. Defaults to 50% of the logical cpu cores. If
     * there are less tests than requested workers, there will be 1 worker used per test.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   workers: 4,
     * });
     * ```
     *
     */
    workers?: number;
    /**
     * Record each test run for replay.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   trace: true,
     * });
     * ```
     *
     */
    trace?: boolean;
    /**
     * Folder to store the traces in. Defaults to `tui-traces`
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   traceFolder: "tui-traces",
     * });
     * ```
     *
     */
    traceFolder?: string;
    /**
     * Timeout in milliseconds for the shell prompt to become ready before running the test.
     * Defaults to 30 seconds.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   shellReadyTimeout: 60000,
     * });
     * ```
     *
     */
    shellReadyTimeout?: number;
    /**
     * TUI Test supports running multiple test projects at the same time.
     *
     * **Usage**
     *
     * ```js
     * // tui-test.config.ts
     * import { defineConfig, Shell } from '@microsoft/tui-test';
     *
     * export default defineConfig({
     *   projects: [
     *     { name: 'bash', use: Shell.Bash }
     *   ]
     * });
     * ```
     *
     */
    projects?: ProjectConfig[];
};
export {};
