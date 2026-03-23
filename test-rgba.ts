import { RGBA } from "@opentui/core";
const color = RGBA.fromHex("#2563EB");
console.log(color);
console.log(Object.keys(color));
console.log(color instanceof Float32Array);
console.log(color.r, color.g, color.b, color.a);
