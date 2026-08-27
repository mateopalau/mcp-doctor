export function sanitizeForTerminal(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if ((codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint === 0x2028 || codePoint === 0x2029) {
      sanitized += `\\x${codePoint.toString(16).padStart(2, "0").toUpperCase()}`;
    } else {
      sanitized += character;
    }
  }
  return sanitized;
}
