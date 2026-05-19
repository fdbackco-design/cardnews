export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

export function splitIntoLines(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const char of text) {
    current += char;
    if (current.length >= maxCharsPerLine && char === " ") {
      lines.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) lines.push(current.trim());
  return lines;
}

export function parseCliArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=?(.*)$/);
    if (match) {
      const [, key, value] = match;
      args[key] = value ?? "true";
    }
  }
  return args;
}
