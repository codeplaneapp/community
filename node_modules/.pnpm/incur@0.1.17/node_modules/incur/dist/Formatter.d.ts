/** Supported output formats. */
export type Format = 'toon' | 'json' | 'yaml' | 'md' | 'jsonl';
/** Serializes a value to the specified format. Defaults to TOON. */
export declare function format(value: unknown, fmt?: Format): string;
//# sourceMappingURL=Formatter.d.ts.map