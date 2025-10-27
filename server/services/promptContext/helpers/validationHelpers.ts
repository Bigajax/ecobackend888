export function parseEnvNumber(
  raw: string | undefined,
  fallback: number,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number {
  const parsed = raw != null ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  let value = parsed;
  if (options.min != null && value < options.min) value = options.min;
  if (options.max != null && value > options.max) value = options.max;
  if (options.integer) value = Math.round(value);
  return value;
}

export function extractNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function normalizeForSignals(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
