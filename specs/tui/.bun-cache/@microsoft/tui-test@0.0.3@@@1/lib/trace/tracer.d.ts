export type TracePoint = DataTracePoint | SizeTracePoint;
export type DataTracePoint = {
    time: number;
    data: string;
};
export type SizeTracePoint = {
    rows: number;
    cols: number;
};
export type Trace = {
    tracePoints: TracePoint[];
    testPath: string[];
    testName: string[];
    attempt: number;
};
export declare const loadTrace: (traceFilename: string) => Promise<Trace>;
export declare const saveTrace: (tracePoints: TracePoint[], testId: string, attempt: number, traceFolder: string) => Promise<void>;
