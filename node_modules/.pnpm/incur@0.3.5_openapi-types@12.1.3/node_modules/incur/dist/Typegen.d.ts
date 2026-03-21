import * as Cli from './Cli.js';
/** Imports a CLI from `input` (must `export default` a `Cli`), generates the `.d.ts`, and writes it to `output`. */
export declare function generate(input: string, output: string): Promise<void>;
/** Generates a `.d.ts` declaration string for the `incur` module augmentation. */
export declare function fromCli(cli: Cli.Cli): string;
//# sourceMappingURL=Typegen.d.ts.map