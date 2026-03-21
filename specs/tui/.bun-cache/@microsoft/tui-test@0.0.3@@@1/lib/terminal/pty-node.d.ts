import type { IPtyBackend, PtyOptions } from "./pty.js";
export declare const createNodePty: (target: string, args: string[], options: PtyOptions) => IPtyBackend;
