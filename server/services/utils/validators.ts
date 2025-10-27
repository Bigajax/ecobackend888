export function isValidUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (normalized.length !== value.length) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(normalized);
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asInteger(value: unknown): number | null {
  const numeric = asNumber(value);
  if (numeric == null) return null;
  return Math.round(numeric);
}
