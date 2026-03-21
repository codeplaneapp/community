export async function readStdinText(
  description: string,
  options: { allowEmpty?: boolean } = {},
): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error(`${description} must be provided on stdin`);
  }

  const input = await Bun.stdin.text();
  if (!options.allowEmpty && input.length === 0) {
    throw new Error(`no ${description} provided on stdin`);
  }

  return input;
}
