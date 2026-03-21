import { type Clock } from "./clock";
import { type ParsedKey } from "./parse.keypress";
import { type RawMouseEvent } from "./parse.mouse";
import type { PasteMetadata } from "./paste";
export { SystemClock, type Clock, type TimerHandle } from "./clock";
export type StdinResponseProtocol = "csi" | "osc" | "dcs" | "apc" | "unknown";
export type StdinEvent = {
    type: "key";
    raw: string;
    key: ParsedKey;
} | {
    type: "mouse";
    raw: string;
    encoding: "sgr" | "x10";
    event: RawMouseEvent;
} | {
    type: "paste";
    bytes: Uint8Array;
    metadata?: PasteMetadata;
} | {
    type: "response";
    protocol: StdinResponseProtocol;
    sequence: string;
};
export interface StdinParserProtocolContext {
    kittyKeyboardEnabled: boolean;
    privateCapabilityRepliesActive: boolean;
    pixelResolutionQueryActive: boolean;
    explicitWidthCprActive: boolean;
}
export interface StdinParserOptions {
    timeoutMs?: number;
    maxPendingBytes?: number;
    armTimeouts?: boolean;
    onTimeoutFlush?: () => void;
    useKittyKeyboard?: boolean;
    protocolContext?: Partial<StdinParserProtocolContext>;
    clock?: Clock;
}
export declare class StdinParser {
    private readonly pending;
    private readonly events;
    private readonly timeoutMs;
    private readonly maxPendingBytes;
    private readonly armTimeouts;
    private readonly onTimeoutFlush;
    private readonly useKittyKeyboard;
    private readonly mouseParser;
    private readonly clock;
    private protocolContext;
    private timeoutId;
    private destroyed;
    private pendingSinceMs;
    private forceFlush;
    private justFlushedEsc;
    private state;
    private cursor;
    private unitStart;
    private paste;
    constructor(options?: StdinParserOptions);
    get bufferCapacity(): number;
    updateProtocolContext(patch: Partial<StdinParserProtocolContext>): void;
    push(data: Uint8Array): void;
    read(): StdinEvent | null;
    drain(onEvent: (event: StdinEvent) => void): void;
    flushTimeout(nowMsValue?: number): void;
    reset(): void;
    resetMouseState(): void;
    destroy(): void;
    private ensureAlive;
    private scanPending;
    private emitKeyOrResponse;
    private emitMouse;
    private emitLegacyHighByte;
    private emitOpaqueResponse;
    private consumePrefix;
    private takePendingBytes;
    private flushPendingOverflow;
    private markPending;
    private consumePasteBytes;
    private pushPasteBytes;
    private reconcileDeferredStateWithProtocolContext;
    private reconcileTimeoutState;
    private clearTimeout;
    private resetState;
}
