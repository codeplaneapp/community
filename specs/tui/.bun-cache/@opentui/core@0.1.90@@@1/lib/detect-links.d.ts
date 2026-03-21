import type { TextChunk } from "../text-buffer";
import type { SimpleHighlight } from "./tree-sitter/types";
export declare function detectLinks(chunks: TextChunk[], context: {
    content: string;
    highlights: SimpleHighlight[];
}): TextChunk[];
