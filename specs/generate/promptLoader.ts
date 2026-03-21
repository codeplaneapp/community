import * as fs from "node:fs";
import * as path from "node:path";

let cachedPrompts: Record<string, string> | null = null;

export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  if (!cachedPrompts) {
    const p = path.join(__dirname, "prompts.mdx");
    const content = fs.readFileSync(p, "utf-8");
    const sections = content.split(/^# /m);
    
    cachedPrompts = {};
    for (const sec of sections) {
      if (!sec.trim()) continue;
      const firstLineBreak = sec.indexOf("\\n");
      const title = sec.substring(0, firstLineBreak).trim();
      const body = sec.substring(firstLineBreak + 1).trim();
      cachedPrompts[title] = body;
    }
  }

  let prompt = cachedPrompts[name];
  if (prompt === undefined) {
    throw new Error(\`Prompt "\${name}" not found in prompts.mdx\`);
  }

  for (const [k, v] of Object.entries(vars)) {
    // replace all occurrences of {{var}}
    prompt = prompt.split(\`{{\${k}}}\`).join(v);
  }

  // Handle any remaining unreplaced vars optionally, but for now we leave them or let it be.
  return prompt;
}
