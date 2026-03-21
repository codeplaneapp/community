/** A single segment in a filter path: either a string key or an array slice. */
export type Segment = {
    key: string;
} | {
    start: number;
    end: number;
};
/** A filter path is an ordered list of segments to traverse. */
export type FilterPath = Segment[];
/** Parses a filter expression string into structured filter paths. */
export declare function parse(expression: string): FilterPath[];
/** Applies parsed filter paths to a data value, returning a filtered copy. */
export declare function apply(data: unknown, paths: FilterPath[]): unknown;
//# sourceMappingURL=Filter.d.ts.map