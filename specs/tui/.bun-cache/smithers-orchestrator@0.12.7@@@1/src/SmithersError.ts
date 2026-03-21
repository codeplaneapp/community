import type { SmithersErrorCode } from "./utils/errors";

export type SmithersError = {
  code: SmithersErrorCode;
  message: string;
  details?: Record<string, unknown>;
};
