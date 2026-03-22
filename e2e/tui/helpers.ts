export interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;
  sendText(text: string): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  snapshot(): string;
  getLine(lineNumber: number): string;
  resize(cols: number, rows: number): Promise<void>;
  terminate(): Promise<void>;
  rows: number;
  cols: number;
}

export async function launchTUI(options?: {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  args?: string[];
}): Promise<TUITestInstance> {
  throw new Error("TUITestInstance: Not yet implemented. This is a stub for E2E test scaffolding.");
}
