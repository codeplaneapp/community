import * as Cli from '../Cli.js';
/**
 * Dynamically imports a module and extracts its default-exported CLI instance.
 * Temporarily replaces `process.argv` and `process.exit` to prevent imported
 * modules that call `.serve()` at the top level from interfering.
 */
export declare function importCli(input: string): Promise<Cli.Cli>;
//# sourceMappingURL=utils.d.ts.map