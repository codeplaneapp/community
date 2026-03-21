import { SyntaxStyle } from "@opentui/core";
import { getPaletteForTier } from "../lib/diff-syntax.js";
import { detectColorCapability } from "./detect.js";

const tier = detectColorCapability();
const palette = getPaletteForTier(tier);

/**
 * Singleton SyntaxStyle for markdown and code rendering outside the diff viewer.
 * Created via SyntaxStyle.fromStyles() with the detected color tier palette.
 *
 * Unlike useDiffSyntaxStyle (which creates per-component instances that are
 * destroyed on unmount — see apps/tui/src/hooks/useDiffSyntaxStyle.ts:42-49),
 * this is a module-level singleton because:
 * 1. MessageBlock instances are created/destroyed frequently during scrolling
 *    with viewport culling — per-instance create/destroy would be expensive.
 * 2. The style is identical across all agent message components.
 * 3. Lifetime matches the TUI process lifetime.
 *
 * Note: SyntaxStyle.fromStyles() allocates native (Zig) resources. This
 * singleton is never destroyed — it lives for the process lifetime. This is
 * intentional and acceptable for a TUI application.
 */
export const defaultSyntaxStyle: SyntaxStyle = SyntaxStyle.fromStyles(palette);
