declare module "js-yaml" {
  interface DumpOptions {
    lineWidth?: number;
  }

  const yaml: {
    load(input: string): unknown;
    dump(input: unknown, options?: DumpOptions): string;
  };

  export default yaml;
}
