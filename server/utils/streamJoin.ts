export function smartJoin(parts: string[]): string {
  // Join with space to prevent word concatenation issues
  // e.g., "está" + "pedindo" → "está pedindo" (not "estápedindo")
  return parts
    .map(p => (typeof p === "string" ? p.trim() : ""))
    .filter(p => p.length > 0)
    .join(" ");
}
