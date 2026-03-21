import type { IPtyBackend, PtyOptions } from "./pty.js";
export declare const createBunPty: (target: string, args: string[], options: PtyOptions) => IPtyBackend;
