import { RGBA } from "@opentui/core";

export const colors = {
  primary: RGBA.fromInts(0, 95, 255, 255),
  success: RGBA.fromInts(0, 175, 0, 255),
  warning: RGBA.fromInts(215, 175, 0, 255),
  error: RGBA.fromInts(255, 0, 0, 255),
  muted: RGBA.fromInts(168, 168, 168, 255), // ANSI 248 actually but used as 245
  border: RGBA.fromInts(88, 88, 88, 255),
};
