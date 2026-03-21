/**
 * Type-safe registration interface. Populate via declaration merging or codegen to enable CTA autocomplete.
 *
 * @example
 * ```ts
 * // codegen: run `mycli --codegen` to generate this file
 * declare module 'incur' {
 *   interface Register {
 *     commands: {
 *       get: { args: { id: number }; options: {} }
 *       list: { args: {}; options: { limit: number } }
 *     }
 *   }
 * }
 * ```
 */
export interface Register {
}
//# sourceMappingURL=Register.d.ts.map