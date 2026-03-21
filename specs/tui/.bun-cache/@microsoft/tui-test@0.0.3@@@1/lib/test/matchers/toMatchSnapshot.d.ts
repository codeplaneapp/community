import type { MatcherContext, AsyncExpectationResult } from "expect";
import { Terminal } from "../../terminal/term.js";
export type SnapshotStatus = "passed" | "failed" | "written" | "updated";
export declare const cleanSnapshot: (testPath: string, retainedSnapshots: Set<string>, updateSnapshot: boolean) => Promise<number>;
export declare const flushSnapshotExecutionCache: () => void;
export declare function toMatchSnapshot(this: MatcherContext, terminal: Terminal, options?: {
    includeColors?: boolean;
}): AsyncExpectationResult;
